import { describe, expect, it } from "vitest";
import type { RunListItem } from "@keidai/shared";
import { deriveRunDisplayStatus } from "../derive-run-display-status.js";
import { filterRuns } from "../filter-runs.js";

function sampleRun(overrides: Partial<RunListItem> = {}): RunListItem {
  return {
    id: "run-1",
    startedAt: "2026-07-08T12:00:00.000Z",
    assignee: "demo-agent",
    goalPreview: "Newsletter draft",
    status: "running",
    stepCount: 3,
    ...overrides,
  };
}

describe("filterRuns", () => {
  const runs = [
    sampleRun(),
    sampleRun({
      id: "run-2",
      goalPreview: "Deploy service",
      status: "completed",
      outcome: { status: "goal_met" },
    }),
  ];

  it("filters by search query across task, id, and agent", () => {
    expect(
      filterRuns(runs, { query: "newsletter", status: "all" }, new Set()),
    ).toHaveLength(1);
    expect(
      filterRuns(runs, { query: "run-2", status: "all" }, new Set()),
    ).toHaveLength(1);
    expect(
      filterRuns(runs, { query: "demo-agent", status: "all" }, new Set()),
    ).toHaveLength(2);
  });

  it("filters by status group", () => {
    expect(
      filterRuns(runs, { query: "", status: "running" }, new Set()),
    ).toHaveLength(1);
    expect(
      filterRuns(runs, { query: "", status: "goal_met" }, new Set()),
    ).toHaveLength(1);
  });
});

describe("deriveRunDisplayStatus", () => {
  it("detects suspended runs from waiting_approval steps", () => {
    const run = sampleRun();
    expect(
      deriveRunDisplayStatus(run, {
        steps: [
          {
            id: "step-1",
            timestamp: "2026-07-08T12:00:01.000Z",
            kind: "waiting_approval",
            approvalId: "approval-1",
          },
        ],
      }),
    ).toBe("waiting_approval");
  });
});
