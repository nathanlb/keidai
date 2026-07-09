import type { RunListItem, RunStep } from "@keidai/shared";

export type RunDisplayStatus =
  | "running"
  | "waiting_approval"
  | "goal_met"
  | "failed"
  | "iteration_exhausted"
  | "timeout"
  | "human_reject";

export type RunStatusFilter =
  | "all"
  | "running"
  | "waiting_approval"
  | "goal_met"
  | "terminated"
  | "failed";

export function isRunSuspended(steps: readonly RunStep[]): boolean {
  const lastStep = steps[steps.length - 1];
  return lastStep?.kind === "waiting_approval";
}

export function deriveRunDisplayStatus(
  run: RunListItem,
  options: {
    suspendedRunIds?: ReadonlySet<string>;
    steps?: readonly RunStep[];
  } = {},
): RunDisplayStatus {
  if (run.status === "running") {
    if (options.steps && isRunSuspended(options.steps)) {
      return "waiting_approval";
    }
    if (options.suspendedRunIds?.has(run.id)) {
      return "waiting_approval";
    }
    return "running";
  }

  if (!run.outcome) {
    return "running";
  }

  return run.outcome.status;
}

export function runStatusFilterGroup(
  status: RunDisplayStatus,
): RunStatusFilter {
  if (
    status === "iteration_exhausted" ||
    status === "timeout" ||
    status === "human_reject"
  ) {
    return "terminated";
  }

  return status;
}

export function matchesRunStatusFilter(
  status: RunDisplayStatus,
  filter: RunStatusFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "terminated") {
    return runStatusFilterGroup(status) === "terminated";
  }

  return status === filter;
}
