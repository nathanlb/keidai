import type { RunListItem, RunStep } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import {
  canSendFollowUp,
  isRunSuspended,
} from "../derive-run-display-status.js";

function run(overrides: Partial<RunListItem> = {}): RunListItem {
  return {
    id: "run-1",
    taskId: "task-1",
    startedAt: "2026-07-14T12:00:00.000Z",
    assignee: "agent-1",
    goalPreview: "goal",
    status: "running",
    stepCount: 1,
    ...overrides,
  };
}

describe("isRunSuspended", () => {
  it("ignores trailing user_message steps when detecting approval suspension", () => {
    const steps: RunStep[] = [
      {
        id: "step-1",
        timestamp: "2026-07-14T12:00:01.000Z",
        kind: "waiting_approval",
        approvalId: "approval-1",
      },
      {
        id: "step-2",
        timestamp: "2026-07-14T12:00:02.000Z",
        kind: "user_message",
        text: "use the backup path",
      },
    ];

    expect(isRunSuspended(steps)).toBe(true);
  });
});

describe("canSendFollowUp", () => {
  it("allows follow-up on waiting_approval and eligible terminal outcomes", () => {
    const waitingSteps: RunStep[] = [
      {
        id: "step-1",
        timestamp: "2026-07-14T12:00:01.000Z",
        kind: "waiting_approval",
        approvalId: "approval-1",
      },
    ];
    expect(canSendFollowUp(run(), waitingSteps)).toBe(true);
    expect(
      canSendFollowUp(
        run({ status: "completed", outcome: { status: "failed", reason: "x" } }),
        [],
      ),
    ).toBe(true);
  });

  it("rejects follow-up while actively running and for human_reject", () => {
    expect(canSendFollowUp(run(), [])).toBe(false);
    expect(
      canSendFollowUp(
        run({ status: "completed", outcome: { status: "human_reject" } }),
        [],
      ),
    ).toBe(false);
  });
});
