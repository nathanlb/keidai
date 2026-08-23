import type { TerminationOutcome } from "@keidai/shared";
import {
  closeUnansweredToolCalls,
  findUnansweredToolCalls,
} from "./pending-tool-calls.js";
import { mapTerminalAssessmentToOutcome } from "./step-assessment.js";
import { isHarnessLocalTool } from "./task-output.js";
import type { ConversationEntry } from "./types/conversation-history.js";
import {
  TaskLoopDeps,
  TaskLoopResult,
  TaskLoopStart,
  ModelStep,
  ToolDispatchResult,
  ModelToolCall,
  ToolDispatchOptions,
} from "./types/task-loop.js";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cloneHistory(
  history: readonly ConversationEntry[],
): ConversationEntry[] {
  return history.map((entry) => {
    if (entry.role === "assistant") {
      return {
        ...entry,
        toolCalls: entry.toolCalls.map((call) => ({ ...call, input: { ...call.input } })),
      };
    }
    return { ...entry };
  });
}

/**
 * The thin harness: call the model with Torii-sourced tools, dispatch tool
 * calls, feed results back, repeat. Every exit funnels through exactly one
 * typed TerminationOutcome:
 * - final text-only step with assessment -> goal_met | human_reject | failed(reason)
 * - harness-only tools (e.g. report_task_output) + assessment -> terminate after dispatch
 * - Torii tool calls                     -> continue (implicit; no assessment needed)
 * - human approval rejection             -> human_reject (harness-driven; no model round-trip)
 * - operator stop                        -> stopped (cooperative; in-flight tool results dropped)
 * - iteration cap reached                -> iteration_exhausted
 * - wall-clock deadline passed           -> timeout
 * - model or harness-level error         -> failed(reason)
 *   (per-call tool errors are fed back as tool results; the model decides)
 */
export async function runTaskLoop(
  start: TaskLoopStart,
  deps: TaskLoopDeps,
): Promise<TaskLoopResult> {
  const now = deps.now ?? Date.now;
  let deadline = now() + start.limits.timeout_seconds * 1000;
  const history = cloneHistory(start.initialHistory);

  const checkpoint = async (): Promise<void> => {
    await deps.onHistoryChanged?.(history);
  };

  const drainPendingUserMessages = async (): Promise<void> => {
    if (!deps.drainPendingUserMessages) {
      return;
    }

    const pending = await deps.drainPendingUserMessages();
    if (pending.length === 0) {
      return;
    }

    for (const entry of pending) {
      history.push(entry);
    }
    await checkpoint();
  };

  const pushToolErrorResult = async (
    call: ModelToolCall,
    error: unknown,
  ): Promise<void> => {
    history.push({
      role: "tool",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: describeError(error),
      isError: true,
    });
    await checkpoint();
  };

  const stopRequested = (): boolean => deps.stopSignal?.aborted === true;

  const terminate = async (
    outcome: TerminationOutcome,
    iterations: number,
  ): Promise<TaskLoopResult> => {
    await drainPendingUserMessages();
    return { outcome, history, iterations };
  };

  const stopNow = async (iterations: number): Promise<TaskLoopResult> => {
    closeUnansweredToolCalls(history);
    await checkpoint();
    return terminate({ status: "stopped" }, iterations);
  };

  const waitForParkedResult = async (
    call: ModelToolCall,
    approvalId: string,
    parked?: { stepId?: string; pollIntervalMs?: number },
  ): Promise<ToolDispatchResult> => {
    if (!deps.waitForApproval) {
      throw new Error(
        `tool call "${call.toolName}" requires approval but no waiter is configured`,
      );
    }

    const pauseStart = now();
    const result = await deps.waitForApproval(approvalId, {
      stepId: parked?.stepId,
      pollIntervalMs: parked?.pollIntervalMs,
      call,
    });
    deadline += now() - pauseStart;

    if (result.policyDenied) {
      throw new Error(`policy denied after approval resume: ${result.text}`);
    }
    return result;
  };

  const resolveToolResult = async (
    call: ModelToolCall,
    options?: ToolDispatchOptions,
  ): Promise<ToolDispatchResult> => {
    let result = await deps.dispatchToolCall(call, {
      ...options,
      signal: options?.signal ?? deps.stopSignal,
    });

    while (result.approvalRequired) {
      if (stopRequested()) {
        return result;
      }
      result = await waitForParkedResult(
        call,
        result.approvalRequired.approvalId,
        {
          stepId: result.approvalRequired.stepId,
          pollIntervalMs: result.approvalRequired.pollIntervalMs,
        },
      );
    }

    return result;
  };

  const appendToolResult = async (
    call: ModelToolCall,
    result: ToolDispatchResult,
  ): Promise<void> => {
    history.push({
      role: "tool",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: result.text,
      ...(result.isError ? { isError: true } : {}),
    });
    await checkpoint();
  };

  const dispatchCall = async (
    call: ModelToolCall,
    iterations: number,
    options?: ToolDispatchOptions,
  ): Promise<TaskLoopResult | undefined> => {
    let result: ToolDispatchResult;
    try {
      result = await resolveToolResult(call, options);
    } catch (error) {
      if (stopRequested()) {
        return stopNow(iterations);
      }
      await pushToolErrorResult(call, error);
      return terminate(
        {
          status: "failed",
          reason: `tool call "${call.toolName}" failed: ${describeError(error)}`,
        },
        iterations,
      );
    }

    if (stopRequested()) {
      return stopNow(iterations);
    }

    await appendToolResult(call, result);

    if (result.approvalDenied) {
      return terminate({ status: "human_reject" }, iterations);
    }
    return undefined;
  };

  if (start.resumeParkedApproval) {
    const unanswered = findUnansweredToolCalls(history);
    const parkedCall = unanswered[0];
    if (!parkedCall) {
      return terminate(
        {
          status: "failed",
          reason: `parked MCP task ${start.resumeParkedApproval.approvalId} has no pending tool call in history`,
        },
        0,
      );
    }

    let parkedResult: ToolDispatchResult;
    try {
      parkedResult = await waitForParkedResult(
        parkedCall,
        start.resumeParkedApproval.approvalId,
      );
    } catch (error) {
      await pushToolErrorResult(parkedCall, error);
      return terminate(
        {
          status: "failed",
          reason: `tool call "${parkedCall.toolName}" failed: ${describeError(error)}`,
        },
        0,
      );
    }

    await appendToolResult(parkedCall, parkedResult);
    if (parkedResult.approvalDenied) {
      return terminate({ status: "human_reject" }, 0);
    }

    for (const call of unanswered.slice(1)) {
      const failed = await dispatchCall(call, 0);
      if (failed) {
        return failed;
      }
    }
  }

  for (let iteration = 1; iteration <= start.limits.max_iterations; iteration++) {
    if (now() >= deadline) {
      return terminate({ status: "timeout" }, iteration - 1);
    }

    if (stopRequested()) {
      return stopNow(iteration - 1);
    }

    await drainPendingUserMessages();

    let step: ModelStep;
    try {
      step = await deps.callModel(history);
    } catch (error) {
      return terminate(
        {
          status: "failed",
          reason: `model call failed: ${describeError(error)}`,
        },
        iteration,
      );
    }

    history.push({
      role: "assistant",
      text: step.text,
      toolCalls: step.toolCalls,
    });
    await checkpoint();

    if (stopRequested()) {
      return stopNow(iteration);
    }

    if (step.toolCalls.length === 0) {
      return terminate(
        mapTerminalAssessmentToOutcome(step.assessment),
        iteration,
      );
    }

    for (const call of step.toolCalls) {
      if (stopRequested()) {
        return stopNow(iteration);
      }
      const failed = await dispatchCall(call, iteration);
      if (failed) {
        return failed;
      }
    }

    // Assessment may share a turn with harness-local tools (e.g. output). Torii
    // tools still suppress assessment upstream; if one leaked through, continue.
    if (
      step.assessment &&
      step.toolCalls.every((call) => isHarnessLocalTool(call.toolName))
    ) {
      return terminate(
        mapTerminalAssessmentToOutcome(step.assessment),
        iteration,
      );
    }

    await checkpoint();
  }

  return terminate({ status: "iteration_exhausted" }, start.limits.max_iterations);
}
