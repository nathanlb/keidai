import type {
  RunStep,
  ToolDispatchRunStep,
  ToolResultRunStep,
} from "@keidai/shared";

export type ToolCallPairStatus = "pending" | "ok" | "error";

export type GroupedToolCallEntry = {
  type: "tool_call";
  /** Stable React key — the dispatch step id. */
  id: string;
  toolCallId: string;
  dispatch: ToolDispatchRunStep;
  result?: ToolResultRunStep;
  status: ToolCallPairStatus;
  durationMs?: number;
};

export type GroupedStepEntry = {
  type: "step";
  step: RunStep;
};

export type GroupedRunLogEntry = GroupedToolCallEntry | GroupedStepEntry;

function resolvePairStatus(
  result: ToolResultRunStep | undefined,
  runEnded: boolean,
): ToolCallPairStatus {
  if (!result) {
    return runEnded ? "error" : "pending";
  }
  return result.status === "error" ? "error" : "ok";
}

function durationBetween(
  startIso: string,
  endIso: string,
): number | undefined {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }
  return Math.max(0, end - start);
}

/**
 * Fold matching `tool_dispatch` + `tool_result` steps (same `toolCallId`) into
 * one run-log entry. Orphaned results stay as standalone rows. Orphaned calls
 * resolve to `error` when the run has ended; otherwise they stay `pending`.
 */
export function groupRunSteps(
  steps: readonly RunStep[],
  options: { runEnded: boolean },
): GroupedRunLogEntry[] {
  const entries: GroupedRunLogEntry[] = [];
  const openByCallId = new Map<string, GroupedToolCallEntry>();

  for (const step of steps) {
    if (step.kind === "tool_dispatch" && step.toolCallId) {
      const entry: GroupedToolCallEntry = {
        type: "tool_call",
        id: step.id,
        toolCallId: step.toolCallId,
        dispatch: step,
        status: options.runEnded ? "error" : "pending",
      };
      openByCallId.set(step.toolCallId, entry);
      entries.push(entry);
      continue;
    }

    if (step.kind === "tool_result" && step.toolCallId) {
      const open = openByCallId.get(step.toolCallId);
      if (open && !open.result) {
        open.result = step;
        open.status = resolvePairStatus(step, options.runEnded);
        open.durationMs = durationBetween(
          open.dispatch.timestamp,
          step.timestamp,
        );
        openByCallId.delete(step.toolCallId);
        continue;
      }
    }

    entries.push({ type: "step", step });
  }

  for (const entry of openByCallId.values()) {
    entry.status = resolvePairStatus(entry.result, options.runEnded);
  }

  return entries;
}

export function formatToolCallDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

export function formatToolCallOutcome(status: ToolCallPairStatus): string {
  return status === "error" ? "failed" : "ok";
}

export function formatToolResultEyebrow(
  entry: GroupedToolCallEntry,
): string {
  if (entry.status === "pending") {
    return "";
  }

  if (!entry.result) {
    return "Error · no result";
  }

  if (entry.status === "error") {
    return "Error · failed";
  }

  if (entry.result.charCount !== undefined) {
    return `Result · ${entry.result.charCount.toLocaleString()} chars`;
  }

  return "Result";
}

export function formatToolResultBody(entry: GroupedToolCallEntry): string {
  if (entry.status === "pending") {
    return "";
  }

  if (!entry.result) {
    return "The run ended before this call returned.";
  }

  if (entry.status === "error") {
    return entry.result.outputPreview ?? "Tool call failed";
  }

  if (entry.result.outputPreview) {
    return entry.result.outputPreview;
  }

  return entry.result.charCount !== undefined
    ? `Returned ${entry.result.charCount.toLocaleString()} chars`
    : "Tool call completed";
}
