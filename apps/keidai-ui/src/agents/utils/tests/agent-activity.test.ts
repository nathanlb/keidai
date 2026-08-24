import type { RunListItem, SavedTask } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import {
  collectAgentRuns,
  collectAgentTasks,
  countRunsForTask,
  isAgentRunning,
  lastOutcomeForTask,
  latestRun,
} from "../agent-activity.js";

const task = (id: string, assignee: string, archived = false): SavedTask => ({
  id,
  goal: `Goal ${id}`,
  trigger: { type: "now" },
  assignee,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...(archived ? { archivedAt: "2026-08-02T00:00:00.000Z" } : {}),
});

const run = (
  id: string,
  overrides: Partial<RunListItem> = {},
): RunListItem => ({
  id,
  taskId: "tsk-1",
  startedAt: "2026-08-20T12:00:00.000Z",
  assignee: "agt-1",
  goalPreview: "Goal tsk-1",
  status: "completed",
  outcome: { status: "goal_met" },
  stepCount: 3,
  ...overrides,
});

describe("agent activity helpers", () => {
  it("keeps live tasks assigned to the agent", () => {
    expect(
      collectAgentTasks(
        [
          task("t1", "agt-1"),
          task("t2", "agt-2"),
          task("t3", "agt-1", true),
        ],
        "agt-1",
      ).map((item) => item.id),
    ).toEqual(["t1"]);
  });

  it("collects runs, latest run, running state, and last outcome", () => {
    const runs = [
      run("r1", { startedAt: "2026-08-20T10:00:00.000Z" }),
      run("r2", {
        startedAt: "2026-08-21T10:00:00.000Z",
        status: "running",
        outcome: undefined,
      }),
      run("r3", { assignee: "agt-2" }),
    ];
    const mine = collectAgentRuns(runs, "agt-1");
    expect(mine.map((item) => item.id)).toEqual(["r1", "r2"]);
    expect(latestRun(mine)?.id).toBe("r2");
    expect(isAgentRunning(mine)).toBe(true);
    expect(lastOutcomeForTask(mine, "tsk-1")).toBe("awaiting");
    expect(
      countRunsForTask(mine, "tsk-1", new Date("2026-08-19T00:00:00.000Z").getTime()),
    ).toBe(2);
  });
});
