import type {
  McpCancelledTask,
  McpCompletedTask,
  McpDetailedTask,
  McpFailedTask,
  McpInputRequiredTask,
  McpTask,
  McpWorkingTask,
} from "@keidai/shared";
import type { StoredMcpTask } from "../types/mcp-task.js";

export function toMcpTask(record: StoredMcpTask): McpTask {
  return {
    taskId: record.taskId,
    status: record.status,
    ...(record.statusMessage !== undefined
      ? { statusMessage: record.statusMessage }
      : {}),
    createdAt: new Date(record.createdAtMs).toISOString(),
    lastUpdatedAt: new Date(record.lastUpdatedAtMs).toISOString(),
    ttlMs: record.ttlMs,
    ...(record.pollIntervalMs !== undefined
      ? { pollIntervalMs: record.pollIntervalMs }
      : {}),
  };
}

export function toDetailedMcpTask(record: StoredMcpTask): McpDetailedTask {
  const base = toMcpTask(record);
  switch (record.status) {
    case "working":
      return base as McpWorkingTask;
    case "input_required":
      return {
        ...base,
        status: "input_required",
        inputRequests: record.inputRequests ?? {},
      } satisfies McpInputRequiredTask;
    case "completed":
      return {
        ...base,
        status: "completed",
        result: record.result ?? {},
      } satisfies McpCompletedTask;
    case "failed":
      return {
        ...base,
        status: "failed",
        error: record.error ?? {},
      } satisfies McpFailedTask;
    case "cancelled":
      return base as McpCancelledTask;
  }
}

export function isMcpTaskExpired(
  record: StoredMcpTask,
  now: number,
): boolean {
  return record.ttlMs !== null && record.createdAtMs + record.ttlMs <= now;
}
