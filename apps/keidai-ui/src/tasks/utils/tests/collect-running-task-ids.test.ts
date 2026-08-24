import type { RunListItem } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import { collectRunningTaskIds } from "../collect-running-task-ids.js";

function run(
  taskId: string,
  status: RunListItem["status"],
): Pick<RunListItem, "taskId" | "status"> {
  return { taskId, status };
}

describe("collectRunningTaskIds", () => {
  it("returns task ids with a store-level running run", () => {
    expect(
      collectRunningTaskIds([
        run("task-a", "running"),
        run("task-b", "completed"),
        run("task-c", "running"),
      ]),
    ).toEqual(new Set(["task-a", "task-c"]));
  });

  it("includes parked-on-approval runs, which stay status running", () => {
    expect(collectRunningTaskIds([run("task-parked", "running")])).toEqual(
      new Set(["task-parked"]),
    );
  });

  it("returns an empty set when nothing is running", () => {
    expect(collectRunningTaskIds([run("task-a", "completed")])).toEqual(
      new Set(),
    );
  });
});
