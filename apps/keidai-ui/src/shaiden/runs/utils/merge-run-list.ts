import type { RunListItem } from "@keidai/shared";
import { LIST_BUFFER_LIMIT } from "../../../shell/constants/list-limits.js";

/** Match backend list order: started_at DESC, id DESC. */
export function compareRunListItems(
  left: Pick<RunListItem, "startedAt" | "id">,
  right: Pick<RunListItem, "startedAt" | "id">,
): number {
  const byTime = right.startedAt.localeCompare(left.startedAt);
  if (byTime !== 0) {
    return byTime;
  }
  return right.id.localeCompare(left.id);
}

export function mergeRunListItem(
  current: readonly RunListItem[],
  run: RunListItem,
  limit = LIST_BUFFER_LIMIT,
): RunListItem[] {
  const without = current.filter((item) => item.id !== run.id);
  return [...without, run]
    .sort(compareRunListItems)
    .slice(0, limit);
}
