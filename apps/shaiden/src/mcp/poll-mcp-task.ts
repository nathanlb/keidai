import {
  isMcpTaskTerminalStatus,
  mcpGetTaskResultSchema,
  type McpGetTaskResult,
} from "@keidai/shared";
import { McpJsonRpcError } from "./post-mcp-jsonrpc.js";

export const DEFAULT_TASK_POLL_INTERVAL_MS = 5_000;
export const MAX_TASK_POLL_INTERVAL_MS = 30_000;
export const MIN_TASK_POLL_INTERVAL_MS = 50;

/** JSON-RPC parse error — truncated or garbled body while a server restarts. */
const JSONRPC_PARSE_ERROR = -32700;
/** JSON-RPC internal error — typical while a server is coming back. */
const JSONRPC_INTERNAL_ERROR = -32603;

const RETRYABLE_JSONRPC_CODES = new Set([
  JSONRPC_PARSE_ERROR,
  JSONRPC_INTERNAL_ERROR,
]);

export function nextTaskPollDelayMs(
  pollIntervalMs: number | undefined,
  random: () => number = Math.random,
): number {
  const capped = Math.min(
    MAX_TASK_POLL_INTERVAL_MS,
    Math.max(
      MIN_TASK_POLL_INTERVAL_MS,
      pollIntervalMs ?? DEFAULT_TASK_POLL_INTERVAL_MS,
    ),
  );
  const jitter = 0.8 + random() * 0.4;
  return Math.round(capped * jitter);
}

export function isFatalMcpPollError(error: unknown): boolean {
  if (!(error instanceof McpJsonRpcError)) {
    return false;
  }
  return !RETRYABLE_JSONRPC_CODES.has(error.code);
}

export async function pollUntilTerminalMcpTask(input: {
  getTask: () => Promise<unknown>;
  initialPollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}): Promise<McpGetTaskResult> {
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let intervalMs = input.initialPollIntervalMs;

  for (;;) {
    let raw: unknown;
    try {
      raw = await input.getTask();
    } catch (error) {
      if (isFatalMcpPollError(error)) {
        throw error;
      }
      await sleep(nextTaskPollDelayMs(intervalMs, input.random));
      continue;
    }
    const parsed = mcpGetTaskResultSchema.safeParse(raw);
    if (!parsed.success) {
      await sleep(nextTaskPollDelayMs(intervalMs, input.random));
      continue;
    }
    const task = parsed.data;
    if (isMcpTaskTerminalStatus(task.status)) {
      return task;
    }
    if (task.status === "input_required") {
      throw new Error(
        "MCP task requires client input, which Shaiden does not support",
      );
    }
    intervalMs = task.pollIntervalMs ?? intervalMs;
    await sleep(nextTaskPollDelayMs(intervalMs, input.random));
  }
}
