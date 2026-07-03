import type { TraceListItem } from "@keidai/shared";
import type { OutcomeFilter } from "./format-trace-outcome.js";

export interface TraceFilters {
  query: string;
  server: string;
  outcome: OutcomeFilter;
}

export const EMPTY_TRACE_FILTERS: TraceFilters = {
  query: "",
  server: "all",
  outcome: "all",
};

function matchesQuery(trace: TraceListItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
    trace.tool,
    trace.server,
    trace.principal?.agentId,
    trace.principal?.ownerId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function filterTraces(
  traces: readonly TraceListItem[],
  filters: TraceFilters,
): TraceListItem[] {
  return traces.filter((trace) => {
    if (filters.server !== "all" && trace.server !== filters.server) {
      return false;
    }
    if (filters.outcome !== "all" && trace.outcome !== filters.outcome) {
      return false;
    }
    return matchesQuery(trace, filters.query);
  });
}

export function hasActiveTraceFilters(filters: TraceFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.server !== "all" ||
    filters.outcome !== "all"
  );
}
