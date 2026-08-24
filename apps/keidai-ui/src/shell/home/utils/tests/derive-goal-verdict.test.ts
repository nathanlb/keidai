import { describe, expect, it } from "vitest";
import { deriveGoalVerdict } from "../derive-goal-verdict.js";

describe("deriveGoalVerdict", () => {
  it("maps goal_met to met and other terminals to missed", () => {
    expect(
      deriveGoalVerdict({
        id: "r1",
        taskId: "t1",
        startedAt: "2026-08-24T12:00:00.000Z",
        assignee: "a1",
        goalPreview: "done",
        status: "completed",
        outcome: { status: "goal_met" },
        stepCount: 3,
      }),
    ).toBe("met");

    expect(
      deriveGoalVerdict({
        id: "r2",
        taskId: "t1",
        startedAt: "2026-08-24T12:00:00.000Z",
        assignee: "a1",
        goalPreview: "boom",
        status: "completed",
        outcome: { status: "failed", reason: "tool error" },
        stepCount: 2,
      }),
    ).toBe("missed");
  });

  it("treats in-flight runs as awaiting", () => {
    expect(
      deriveGoalVerdict({
        id: "r3",
        taskId: "t1",
        startedAt: "2026-08-24T12:00:00.000Z",
        assignee: "a1",
        goalPreview: "working",
        status: "running",
        stepCount: 1,
      }),
    ).toBe("awaiting");
  });
});
