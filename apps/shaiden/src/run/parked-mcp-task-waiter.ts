import type { Logger } from "@keidai/shared";
import type { ActiveRunHandle } from "./active-run-registry.js";
import type { RunReporter } from "./run-reporter.js";
import { recordToolResult } from "./run-step-recording.js";
import type {
  ApprovalWaitContext,
  ToolDispatchResult,
} from "./types/task-loop.js";
import type { RunStore } from "../runs/run-store.js";

/**
 * Persist the MCP task id, freeze follow-up queuing, and poll until the gated
 * call's tool result is available. Denials are not recorded as successful
 * tool results — the task loop terminates as `human_reject`.
 */
export function createParkedMcpTaskWaiter(input: {
  runId: string;
  runStore: RunStore;
  pollMcpTask: (
    taskId: string,
    pollIntervalMs?: number,
  ) => Promise<ToolDispatchResult>;
  reporter: RunReporter;
  logger: Logger;
  activeHandle: ActiveRunHandle;
}): (
  mcpTaskId: string,
  context?: ApprovalWaitContext,
) => Promise<ToolDispatchResult> {
  return async (mcpTaskId, context) => {
    const pollIntervalMs =
      context?.pollIntervalMs ??
      input.runStore.getParkedMcpTask(input.runId)?.pollIntervalMs;
    input.runStore.setParkedMcpTask(input.runId, {
      mcpTaskId,
      pollIntervalMs,
    });
    input.logger.info("run.waiting_approval", {
      runId: input.runId,
      approvalId: mcpTaskId,
      stepId: context?.stepId,
      wakeup: "task_poll",
    });
    input.reporter.recordStep({
      id: context?.stepId,
      kind: "waiting_approval",
      approvalId: mcpTaskId,
      toolName: context?.call?.toolName,
    });
    input.activeHandle.setWaitingForApproval(true);
    try {
      const result = await input.pollMcpTask(mcpTaskId, pollIntervalMs);
      if (context?.call && !result.approvalDenied) {
        recordToolResult(input.reporter, context.call, result);
      }
      return result;
    } finally {
      input.activeHandle.setWaitingForApproval(false);
      input.runStore.clearParkedMcpTask(input.runId);
    }
  };
}
