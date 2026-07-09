import type { RunListItem } from "@keidai/shared";
import {
  deriveRunDisplayStatus,
  matchesRunStatusFilter,
  type RunStatusFilter,
} from "./derive-run-display-status.js";

export interface RunFilters {
  query: string;
  status: RunStatusFilter;
}

export const EMPTY_RUN_FILTERS: RunFilters = {
  query: "",
  status: "all",
};

export function filterRuns(
  runs: readonly RunListItem[],
  filters: RunFilters,
  suspendedRunIds: ReadonlySet<string>,
): RunListItem[] {
  const query = filters.query.trim().toLowerCase();

  return runs.filter((run) => {
    const status = deriveRunDisplayStatus(run, { suspendedRunIds });
    if (!matchesRunStatusFilter(status, filters.status)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      run.goalPreview.toLowerCase().includes(query) ||
      run.id.toLowerCase().includes(query) ||
      run.assignee.toLowerCase().includes(query)
    );
  });
}
