import type { RunListItem, RunStep } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import { formatRunDuration } from "../format-run-time.js";

const startedAt = "2026-10-01T12:00:00.000Z";
const now = Date.parse("2026-10-27T15:04:00.000Z");

function run(overrides: Partial<RunListItem> = {}): RunListItem {
  return {
    id: "run-1",
    taskId: "task-1",
    startedAt,
    assignee: "agent-1",
    goalPreview: "Summarize the inbox",
    status: "completed",
    outcome: { status: "goal_met" },
    stepCount: 2,
    ...overrides,
  };
}

describe("formatRunDuration", () => {
  it("shows active task time for a finished run, not time since it started", () => {
    expect(
      formatRunDuration(run({ activeElapsedMs: 12_400 }), undefined, now),
    ).toBe("12s");
  });

  it("shows active task time while a run is parked, not wall-clock wait", () => {
    expect(
      formatRunDuration(
        run({
          status: "running",
          outcome: undefined,
          activeElapsedMs: 8_200,
        }),
        undefined,
        now,
      ),
    ).toBe("8s");
  });

  it("does not keep a finished run's duration growing when active time is unknown", () => {
    expect(formatRunDuration(run(), undefined, now)).toBe("—");
  });

  it("uses the recorded step span when a finished run has no active-time budget", () => {
    const steps: RunStep[] = [
      {
        id: "step-1",
        timestamp: "2026-10-01T12:00:01.500Z",
        kind: "model",
        text: "Done",
      },
    ];

    expect(formatRunDuration(run({ activeElapsedMs: 0 }), steps, now)).toBe(
      "1s",
    );
  });

  it("displays whole seconds and never a fractional second", () => {
    expect(
      formatRunDuration(run({ activeElapsedMs: 400 }), undefined, now),
    ).toBe("0s");
    expect(
      formatRunDuration(run({ activeElapsedMs: 1_500 }), undefined, now),
    ).toBe("1s");
    expect(
      formatRunDuration(run({ activeElapsedMs: 90_000 }), undefined, now),
    ).toBe("1m 30s");
  });
});
