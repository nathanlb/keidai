import type { RunListItem } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import { compareRunListItems, mergeRunListItem } from "../merge-run-list.js";

function run(
  id: string,
  startedAt: string,
  overrides: Partial<RunListItem> = {},
): RunListItem {
  return {
    id,
    taskId: "task-1",
    startedAt,
    assignee: "agent-1",
    goalPreview: "goal",
    status: "completed",
    outcome: { status: "goal_met" },
    stepCount: 1,
    ...overrides,
  };
}

describe("compareRunListItems", () => {
  it("orders by startedAt descending, then id descending", () => {
    const items = [
      run("a", "2026-07-14T10:00:00.000Z"),
      run("c", "2026-07-14T12:00:00.000Z"),
      run("b", "2026-07-14T12:00:00.000Z"),
    ];

    expect([...items].sort(compareRunListItems).map((item) => item.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
});

describe("mergeRunListItem", () => {
  it("keeps newest-first order when SSE replays older runs", () => {
    const current = [
      run("new", "2026-07-14T12:00:00.000Z"),
      run("mid", "2026-07-14T11:00:00.000Z"),
      run("old", "2026-07-14T10:00:00.000Z"),
    ];

    // SSE dumps newest-first; naive prepend would reverse the list.
    let merged = current;
    for (const item of current) {
      merged = mergeRunListItem(merged, item);
    }

    expect(merged.map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });

  it("updates an existing run in place without promoting it", () => {
    const current = [
      run("new", "2026-07-14T12:00:00.000Z", { status: "running" }),
      run("old", "2026-07-14T10:00:00.000Z", { status: "running" }),
    ];

    const merged = mergeRunListItem(
      current,
      run("old", "2026-07-14T10:00:00.000Z", {
        status: "completed",
        outcome: { status: "goal_met" },
        stepCount: 4,
      }),
    );

    expect(merged.map((item) => item.id)).toEqual(["new", "old"]);
    expect(merged[1]?.status).toBe("completed");
    expect(merged[1]?.stepCount).toBe(4);
  });

  it("inserts a brand-new run by startedAt", () => {
    const current = [
      run("mid", "2026-07-14T11:00:00.000Z"),
      run("old", "2026-07-14T10:00:00.000Z"),
    ];

    const merged = mergeRunListItem(
      current,
      run("new", "2026-07-14T12:00:00.000Z"),
    );

    expect(merged.map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });
});
