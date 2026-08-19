import type { RunListItem } from "@keidai/shared";

/** Task ids that currently have a store-level `running` run, including parked-on-approval. */
export function collectRunningTaskIds(
  runs: readonly Pick<RunListItem, "taskId" | "status">[],
): Set<string> {
  const ids = new Set<string>();
  for (const run of runs) {
    if (run.status === "running") {
      ids.add(run.taskId);
    }
  }
  return ids;
}
