import type { TraceListItem, TraceOutcome } from "@keidai/shared";

export type OutcomeCounts = Record<TraceOutcome, number> & { all: number };

export function countTraceOutcomes(
  traces: readonly TraceListItem[],
): OutcomeCounts {
  const counts: OutcomeCounts = {
    all: traces.length,
    success: 0,
    error: 0,
    denied: 0,
    linking_required: 0,
  };

  for (const trace of traces) {
    counts[trace.outcome] += 1;
  }

  return counts;
}
