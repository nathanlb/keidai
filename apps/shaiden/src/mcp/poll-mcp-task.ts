import {
  isMcpTaskTerminalStatus,
  mcpGetTaskResultSchema,
  type McpGetTaskResult,
} from "@keidai/shared";

export const DEFAULT_TASK_POLL_INTERVAL_MS = 5_000;
export const MAX_TASK_POLL_INTERVAL_MS = 30_000;
export const MIN_TASK_POLL_INTERVAL_MS = 50;

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
    const parsed = mcpGetTaskResultSchema.safeParse(await input.getTask());
    if (!parsed.success) {
      throw new Error(`Invalid tasks/get result: ${parsed.error.message}`);
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
