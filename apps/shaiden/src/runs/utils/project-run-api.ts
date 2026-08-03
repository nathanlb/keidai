import type { RunListItem, RunReport } from "@keidai/shared";

export function projectRunListItem(run: RunReport): RunListItem {
  return {
    id: run.id,
    taskId: run.taskId,
    startedAt: run.startedAt,
    assignee: run.assignee,
    goalPreview: run.goalPreview,
    status: run.status,
    outcome: run.outcome,
    stepCount: run.steps.length,
    ...(run.personaVersion !== undefined
      ? { personaVersion: run.personaVersion }
      : {}),
    ...(run.persona !== undefined ? { persona: run.persona } : {}),
  };
}
