import type { TerminationOutcome } from "@keidai/shared";
import { mapTerminalAssessmentToOutcome } from "./step-assessment.js";
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
 * - Torii tool calls                     -> continue (implicit; no assessment needed)
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

  const checkpoint = (): void => {
    deps.onHistoryChanged?.(history);
  };

  const drainPendingUserMessages = (): void => {
    if (!deps.drainPendingUserMessages) {
      return;
    }

    const pending = deps.drainPendingUserMessages();
    if (pending.length === 0) {
      return;
    }

    for (const entry of pending) {
      history.push(entry);
    }
    checkpoint();
  };

  const pushToolErrorResult = (call: ModelToolCall, error: unknown): void => {
    history.push({
      role: "tool",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: describeError(error),
      isError: true,
    });
    checkpoint();
  };

  const terminate = (
    outcome: TerminationOutcome,
    iterations: number,
  ): TaskLoopResult => {
    drainPendingUserMessages();
    return { outcome, history, iterations };
  };

  const resolveToolResult = async (
    call: ModelToolCall,
    options?: ToolDispatchOptions,
  ): Promise<ToolDispatchResult> => {
    let result = await deps.dispatchToolCall(call, options);

    while (result.approvalRequired) {
      if (!deps.waitForApproval) {
        throw new Error(
          `tool call "${call.toolName}" requires approval but no waiter is configured`,
        );
      }

      const pauseStart = now();
      const decision = await deps.waitForApproval(
        result.approvalRequired.approvalId,
        { stepId: result.approvalRequired.stepId },
      );
      deadline += now() - pauseStart;

      if (decision.status === "rejected") {
        return {
          isError: false,
          text: decision.reason
            ? `Human review denied this tool call. Reason: ${decision.reason}. This denial is authoritative — do not retry this call or attempt the same action through a different tool.`
            : "Human review denied this tool call. This denial is authoritative — do not retry this call or attempt the same action through a different tool.",
          approvalDenied: true,
        };
      }
      if (decision.status === "cancelled") {
        throw new Error("cancelled by operator");
      }

      result = await deps.dispatchToolCall(call, {
        ...options,
        approvalId: result.approvalRequired.approvalId,
        stepId: result.approvalRequired.stepId,
      });
    }

    return result;
  };

  for (let iteration = 1; iteration <= start.limits.max_iterations; iteration++) {
    if (now() >= deadline) {
      return terminate({ status: "timeout" }, iteration - 1);
    }

    drainPendingUserMessages();

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
    checkpoint();

    if (step.toolCalls.length === 0) {
      return terminate(
        mapTerminalAssessmentToOutcome(step.assessment),
        iteration,
      );
    }

    for (const call of step.toolCalls) {
      let result: ToolDispatchResult;
      try {
        result = await resolveToolResult(call);
      } catch (error) {
        pushToolErrorResult(call, error);
        return terminate(
          {
            status: "failed",
            reason: `tool call "${call.toolName}" failed: ${describeError(error)}`,
          },
          iteration,
        );
      }

      history.push({
        role: "tool",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: result.text,
        ...(result.isError ? { isError: true } : {}),
      });
    }
    checkpoint();
  }

  return terminate({ status: "iteration_exhausted" }, start.limits.max_iterations);
}
