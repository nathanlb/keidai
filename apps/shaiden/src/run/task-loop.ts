import type { TaskLimits, TerminationOutcome } from "@keidai/shared";
import { isHumanRejectResponse } from "../mcp/parse-tool-result.js";
import {
  TaskLoopDeps,
  TaskLoopResult,
  ConversationEntry,
  ModelStep,
  ToolDispatchResult,
  ModelToolCall,
  ToolDispatchOptions,
} from "./types/task-loop.js";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The thin harness: call the model with Torii-sourced tools, dispatch tool
 * calls, feed results back, repeat. Every exit funnels through exactly one
 * typed TerminationOutcome:
 * - final text-only response          -> goal_met (agent's self-assessment)
 * - final text prefixed HUMAN_REJECT: -> human_reject (goal unreachable after denial)
 * - iteration cap reached             -> iteration_exhausted
 * - wall-clock deadline passed        -> timeout
 * - unavailable/unsatisfiable tool,
 *   or model/dispatch error           -> failed(reason), fail fast
 */
export async function runTaskLoop(
  goalPrompt: string,
  limits: TaskLimits,
  deps: TaskLoopDeps,
): Promise<TaskLoopResult> {
  const now = deps.now ?? Date.now;
  let deadline = now() + limits.timeout_seconds * 1000;
  const history: ConversationEntry[] = [{ role: "user", text: goalPrompt }];

  const terminate = (
    outcome: TerminationOutcome,
    iterations: number,
  ): TaskLoopResult => ({ outcome, history, iterations });

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

      result = await deps.dispatchToolCall(call, {
        ...options,
        approvalId: result.approvalRequired.approvalId,
        stepId: result.approvalRequired.stepId,
      });
    }

    return result;
  };

  for (let iteration = 1; iteration <= limits.max_iterations; iteration++) {
    if (now() >= deadline) {
      return terminate({ status: "timeout" }, iteration - 1);
    }

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

    if (step.toolCalls.length === 0) {
      if (isHumanRejectResponse(step.text)) {
        return terminate({ status: "human_reject" }, iteration);
      }
      return terminate({ status: "goal_met" }, iteration);
    }

    for (const call of step.toolCalls) {
      let result: ToolDispatchResult;
      try {
        result = await resolveToolResult(call);
      } catch (error) {
        return terminate(
          {
            status: "failed",
            reason: `tool call "${call.toolName}" failed: ${describeError(error)}`,
          },
          iteration,
        );
      }

      if (result.isError) {
        return terminate(
          {
            status: "failed",
            reason: `tool call "${call.toolName}" returned an error: ${result.text}`,
          },
          iteration,
        );
      }

      history.push({
        role: "tool",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: result.text,
      });
    }
  }

  return terminate({ status: "iteration_exhausted" }, limits.max_iterations);
}
