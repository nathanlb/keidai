import type { RunListItem } from "@keidai/shared";
import {
  deriveRunDisplayStatus,
  runStatusFilterGroup,
  type RunDisplayStatus,
  type RunStatusFilter,
} from "./derive-run-display-status.js";

export type RunStatusCounts = Record<RunStatusFilter, number>;

function isToday(iso: string, now = new Date()): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function countRunStatuses(
  runs: readonly RunListItem[],
  suspendedRunIds: ReadonlySet<string>,
): RunStatusCounts {
  const counts: RunStatusCounts = {
    all: runs.length,
    running: 0,
    waiting_approval: 0,
    goal_met: 0,
    terminated: 0,
    failed: 0,
  };

  for (const run of runs) {
    const status = deriveRunDisplayStatus(run, { suspendedRunIds });
    const group = runStatusFilterGroup(status);
    if (group === "running") {
      counts.running += 1;
    } else if (group === "waiting_approval") {
      counts.waiting_approval += 1;
    } else if (group === "goal_met") {
      counts.goal_met += 1;
    } else if (group === "failed") {
      counts.failed += 1;
    } else if (group === "terminated") {
      counts.terminated += 1;
    }
  }

  return counts;
}

export function countRunsToday(runs: readonly RunListItem[]): number {
  return runs.filter((run) => isToday(run.startedAt)).length;
}

export function summarizeRunStats(
  runs: readonly RunListItem[],
  suspendedRunIds: ReadonlySet<string>,
) {
  const statusCounts = countRunStatuses(runs, suspendedRunIds);
  return {
    runsToday: countRunsToday(runs),
    running: statusCounts.running,
    awaitingReview: statusCounts.waiting_approval,
    failed: statusCounts.failed,
    statusCounts,
  };
}

export function statusCountForChip(
  counts: RunStatusCounts,
  filter: RunStatusFilter,
): number {
  return counts[filter];
}

export function isActiveRunStatus(status: RunDisplayStatus): boolean {
  return status === "running" || status === "waiting_approval";
}
