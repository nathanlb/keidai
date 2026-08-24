import type { TraceListItem } from "@keidai/shared";
import type { OutcomeFilter } from "./format-trace-outcome.js";
import { resolveAgentSlug } from "./format-agent-principal.js";

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

function matchesQuery(
  trace: TraceListItem,
  query: string,
  agentSlugById: ReadonlyMap<string, string>,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const agentId = trace.principal?.agentId;
  const haystack = [
    trace.tool,
    trace.server,
    agentId,
    resolveAgentSlug(agentId, agentSlugById),
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
  agentSlugById: ReadonlyMap<string, string> = new Map(),
): TraceListItem[] {
  return traces.filter((trace) => {
    if (filters.server !== "all" && trace.server !== filters.server) {
      return false;
    }
    if (filters.outcome !== "all" && trace.outcome !== filters.outcome) {
      return false;
    }
    return matchesQuery(trace, filters.query, agentSlugById);
  });
}

export function hasActiveTraceFilters(filters: TraceFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.server !== "all" ||
    filters.outcome !== "all"
  );
}
