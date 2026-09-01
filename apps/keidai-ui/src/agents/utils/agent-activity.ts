import type { RunListItem, SavedTask } from "@keidai/shared";
import { deriveGoalVerdict } from "../../home/utils/derive-goal-verdict.js";
import type { GoalVerdict } from "../../home/types/home-digest.js";
import { formatScheduleTrigger } from "../../tasks/utils/format-schedule.js";

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function collectAgentTasks(
  tasks: readonly SavedTask[],
  agentId: string,
): SavedTask[] {
  return tasks.filter(
    (task) => task.assignee === agentId && !task.archivedAt,
  );
}

export function collectAgentRuns(
  runs: readonly RunListItem[],
  agentId: string,
): RunListItem[] {
  return runs.filter((run) => run.assignee === agentId);
}

export function sortRunsNewestFirst<T extends RunListItem>(
  runs: readonly T[],
): T[] {
  return [...runs].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

export function latestRun<T extends RunListItem>(
  runs: readonly T[],
): T | undefined {
  return sortRunsNewestFirst(runs)[0];
}

export function latestRunForTask<T extends RunListItem>(
  runs: readonly T[],
  taskId: string,
): T | undefined {
  return latestRun(runs.filter((run) => run.taskId === taskId));
}

export function isAgentRunning(runs: readonly RunListItem[]): boolean {
  return runs.some((run) => run.status === "running");
}

export function runsSince<T extends RunListItem>(
  runs: readonly T[],
  sinceMs: number,
): T[] {
  return runs.filter((run) => new Date(run.startedAt).getTime() >= sinceMs);
}

export function countRunsForTask(
  runs: readonly RunListItem[],
  taskId: string,
  sinceMs: number,
): number {
  return runsSince(runs, sinceMs).filter((run) => run.taskId === taskId)
    .length;
}

export interface VerdictCounts {
  met: number;
  partial: number;
  missed: number;
  awaiting: number;
}

export function countVerdicts(runs: readonly RunListItem[]): VerdictCounts {
  const counts: VerdictCounts = {
    met: 0,
    partial: 0,
    missed: 0,
    awaiting: 0,
  };
  for (const run of runs) {
    counts[deriveGoalVerdict(run)] += 1;
  }
  return counts;
}

export function scheduleLabel(task: SavedTask): string {
  if (task.trigger.type === "now") {
    return "On demand";
  }
  return formatScheduleTrigger(task.trigger);
}

export function lastOutcomeForTask(
  runs: readonly RunListItem[],
  taskId: string,
): GoalVerdict | null {
  const run = latestRunForTask(runs, taskId);
  return run ? deriveGoalVerdict(run) : null;
}
