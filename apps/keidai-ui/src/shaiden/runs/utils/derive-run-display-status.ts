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
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (!step || step.kind === "user_message") {
      continue;
    }
    return step.kind === "waiting_approval";
  }
  return false;
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

const ELIGIBLE_FOLLOW_UP_OUTCOMES = new Set<RunDisplayStatus>([
  "failed",
  "goal_met",
  "iteration_exhausted",
  "timeout",
]);

export function canSendFollowUp(
  run: RunListItem,
  steps: readonly RunStep[],
): boolean {
  const status = deriveRunDisplayStatus(run, { steps });
  if (status === "waiting_approval") {
    return true;
  }

  return ELIGIBLE_FOLLOW_UP_OUTCOMES.has(status);
}
