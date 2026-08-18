import type { Logger } from "@keidai/shared";
import {
  leaseExpiresAt,
  RunLeaseLostError,
} from "./run-lease.js";
import type { RunReporter } from "./run-reporter.js";
import { recordToolResult } from "./run-step-recording.js";
import type {
  ApprovalWaitContext,
  ToolDispatchResult,
} from "./types/task-loop.js";
import type { RunStore } from "../runs/run-store.js";

async function awaitUnlessAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  runId: string,
): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw new RunLeaseLostError(runId);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new RunLeaseLostError(runId));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Persist the MCP task id and poll until the gated call's tool result is
 * available. Denials are not recorded as successful tool results — the task
 * loop terminates as `human_reject`. Parked state stays in the store if this
 * replica loses the run lease so another replica can finish the wait.
 */
export function createParkedMcpTaskWaiter(input: {
  runId: string;
  runStore: RunStore;
  replicaId: string;
  leaseMs: number;
  now?: () => number;
  signal?: AbortSignal;
  pollMcpTask: (
    taskId: string,
    pollIntervalMs?: number,
  ) => Promise<ToolDispatchResult>;
  reporter: RunReporter;
  logger: Logger;
}): (
  mcpTaskId: string,
  context?: ApprovalWaitContext,
) => Promise<ToolDispatchResult> {
  const now = input.now ?? Date.now;

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

    const result = await awaitUnlessAborted(
      input.pollMcpTask(mcpTaskId, pollIntervalMs),
      input.signal,
      input.runId,
    );

    if (
      !input.runStore.renewRunLease(
        input.runId,
        input.replicaId,
        leaseExpiresAt(now(), input.leaseMs),
      )
    ) {
      throw new RunLeaseLostError(input.runId);
    }

    if (context?.call && !result.approvalDenied) {
      recordToolResult(input.reporter, context.call, result);
    }
    input.runStore.clearParkedMcpTask(input.runId);
    return result;
  };
}
