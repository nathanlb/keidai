import type { Run, Task, TerminationOutcome } from "@keidai/shared";

export function createRun(
  id: string,
  task: Task,
  startedAt = new Date(),
): Omit<Run, "outcome"> {
  return {
    id,
    task,
    startedAt: startedAt.toISOString(),
  };
}

export function completeRun(
  run: Omit<Run, "outcome">,
  outcome: TerminationOutcome,
): Run {
  return { ...run, outcome };
}
