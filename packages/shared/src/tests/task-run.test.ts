import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextRunAt, nextRunAtAfterUpdate } from "../next-run-at.js";
import {
  DEFAULT_TASK_LIMITS,
  resolveTaskLimits,
  taskSchema,
  taskTriggersEqual,
  terminationOutcomeSchema,
  type ScheduleTrigger,
  type Task,
} from "../index.js";

const sampleTask: Task = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" },
  assignee: "shaiden-newsletter-01",
};

function schedule(overrides: Partial<ScheduleTrigger> = {}): ScheduleTrigger {
  return {
    type: "schedule",
    timezone: "America/New_York",
    at: "2026-09-01T09:00",
    ...overrides,
  };
}

describe("task schema", () => {
  it("accepts a v0 task with the four required fields", () => {
    const parsed = taskSchema.parse(sampleTask);
    assert.equal(parsed.goal, sampleTask.goal);
    assert.deepEqual(parsed.trigger, { type: "now" });
    assert.equal(parsed.assignee, sampleTask.assignee);
  });

  it("rejects trigger variants other than now and schedule", () => {
    assert.throws(() =>
      taskSchema.parse({
        ...sampleTask,
        trigger: { type: "cron", schedule: "0 9 * * 1" },
      }),
    );
  });

  it("accepts a one-shot schedule trigger", () => {
    const parsed = taskSchema.parse({
      ...sampleTask,
      trigger: schedule(),
    });
    assert.equal(parsed.trigger.type, "schedule");
    if (parsed.trigger.type === "schedule") {
      assert.equal(parsed.trigger.timezone, "America/New_York");
      assert.equal(parsed.trigger.at, "2026-09-01T09:00");
    }
  });

  it("rejects an invalid IANA timezone", () => {
    assert.throws(() =>
      taskSchema.parse({
        ...sampleTask,
        trigger: schedule({ timezone: "Not/A_Zone" }),
      }),
    );
  });

  it("rejects weekly recurrence without days", () => {
    assert.throws(() =>
      taskSchema.parse({
        ...sampleTask,
        trigger: {
          type: "schedule",
          timezone: "America/New_York",
          at: "2026-09-01T09:00",
          recurrence: { freq: "weekly" },
        },
      }),
    );
  });

  it("applies hardcoded default limits when omitted", () => {
    assert.deepEqual(resolveTaskLimits(sampleTask), DEFAULT_TASK_LIMITS);
  });

  it("preserves explicit limits when provided", () => {
    const limits = { max_iterations: 10, timeout_seconds: 120 };
    assert.deepEqual(
      resolveTaskLimits({ ...sampleTask, limits }),
      limits,
    );
  });
});

describe("nextRunAt", () => {
  it("returns null for now and paused triggers", () => {
    assert.equal(
      nextRunAt({ type: "now" }, new Date("2026-08-01T00:00:00.000Z")),
      null,
    );
    assert.equal(
      nextRunAt(
        schedule({ paused: true }),
        new Date("2026-08-01T00:00:00.000Z"),
      ),
      null,
    );
  });

  it("returns the one-shot instant when it is still in the future", () => {
    const next = nextRunAt(
      schedule({ at: "2026-09-01T09:00" }),
      new Date("2026-08-31T12:00:00.000Z"),
    );
    assert.equal(next?.toISOString(), "2026-09-01T13:00:00.000Z");
  });

  it("returns null for a spent one-shot", () => {
    assert.equal(
      nextRunAt(
        schedule({ at: "2026-09-01T09:00" }),
        new Date("2026-09-01T13:00:01.000Z"),
      ),
      null,
    );
  });

  it("skips the current one-shot slot when after is set", () => {
    assert.equal(
      nextRunAt(
        schedule({ at: "2026-09-01T09:00" }),
        new Date("2026-09-01T13:00:00.000Z"),
        { after: true },
      ),
      null,
    );
  });

  it("finds the next daily fire in the task timezone", () => {
    const trigger = schedule({
      at: "2026-09-01T09:00",
      recurrence: { freq: "daily" },
    });
    const next = nextRunAt(trigger, new Date("2026-09-01T14:00:00.000Z"));
    assert.equal(next?.toISOString(), "2026-09-02T13:00:00.000Z");
  });

  it("finds the next weekly weekday", () => {
    const trigger = schedule({
      at: "2026-09-01T09:00",
      recurrence: { freq: "weekly", days: ["mon"] },
    });
    // 2026-09-01 is Tuesday; next Monday is 2026-09-07 09:00 EDT = 13:00Z
    const next = nextRunAt(trigger, new Date("2026-09-01T14:00:00.000Z"));
    assert.equal(next?.toISOString(), "2026-09-07T13:00:00.000Z");
  });

  it("uses the last day of short months for a 31st monthly schedule", () => {
    const trigger = schedule({
      at: "2026-01-31T09:00",
      recurrence: { freq: "monthly" },
    });
    const next = nextRunAt(
      trigger,
      new Date("2026-01-31T15:00:00.000Z"),
      { after: true },
    );
    assert.equal(next?.toISOString(), "2026-02-28T14:00:00.000Z");
  });

  it("keeps 9am wall time across the spring-forward DST gap", () => {
    const trigger = schedule({
      at: "2026-03-07T09:00",
      recurrence: { freq: "daily" },
    });
    const before = nextRunAt(trigger, new Date("2026-03-07T00:00:00.000Z"));
    const after = nextRunAt(
      trigger,
      new Date("2026-03-08T00:00:00.000Z"),
    );
    // EST (UTC-5) then EDT (UTC-4)
    assert.equal(before?.toISOString(), "2026-03-07T14:00:00.000Z");
    assert.equal(after?.toISOString(), "2026-03-08T13:00:00.000Z");
  });

  it("keeps 9am wall time across the fall-back DST fold", () => {
    const trigger = schedule({
      at: "2026-10-31T09:00",
      recurrence: { freq: "daily" },
    });
    const before = nextRunAt(trigger, new Date("2026-10-31T00:00:00.000Z"));
    const after = nextRunAt(
      trigger,
      new Date("2026-11-01T00:00:00.000Z"),
    );
    // EDT (UTC-4) then EST (UTC-5)
    assert.equal(before?.toISOString(), "2026-10-31T13:00:00.000Z");
    assert.equal(after?.toISOString(), "2026-11-01T14:00:00.000Z");
  });

  it("maps a spring-forward gap time to a real instant", () => {
    const trigger = schedule({
      at: "2026-03-08T02:30",
      recurrence: { freq: "daily" },
    });
    const next = nextRunAt(trigger, new Date("2026-03-08T00:00:00.000Z"));
    assert.ok(next);
    assert.equal(Number.isNaN(next.getTime()), false);
  });
});

describe("taskTriggersEqual", () => {
  it("treats weekly days as a set", () => {
    assert.equal(
      taskTriggersEqual(
        schedule({ recurrence: { freq: "weekly", days: ["mon", "wed"] } }),
        schedule({ recurrence: { freq: "weekly", days: ["wed", "mon"] } }),
      ),
      true,
    );
  });
});

describe("nextRunAtAfterUpdate", () => {
  it("keeps the stored cursor when only non-trigger fields would change", () => {
    const trigger = schedule({
      at: "2026-09-01T09:00",
      recurrence: { freq: "daily" },
    });
    const overdue = "2026-08-31T13:00:00.000Z";
    assert.deepEqual(
      nextRunAtAfterUpdate(
        trigger,
        overdue,
        trigger,
        new Date("2026-09-01T14:00:00.000Z"),
      ),
      { nextRunAt: overdue, resetScheduleState: false },
    );
  });

  it("recomputes when the schedule itself changes", () => {
    const existing = schedule({
      at: "2026-09-01T09:00",
      recurrence: { freq: "daily" },
    });
    const merged = schedule({
      at: "2026-09-01T10:00",
      recurrence: { freq: "daily" },
    });
    const result = nextRunAtAfterUpdate(
      existing,
      "2026-09-01T13:00:00.000Z",
      merged,
      new Date("2026-09-01T12:00:00.000Z"),
    );
    assert.equal(result.resetScheduleState, true);
    assert.equal(result.nextRunAt, "2026-09-01T14:00:00.000Z");
  });
});

describe("termination taxonomy", () => {
  it("accepts each v0 outcome variant", () => {
    for (const outcome of [
      { status: "goal_met" as const },
      { status: "iteration_exhausted" as const },
      { status: "timeout" as const },
      { status: "human_reject" as const },
      { status: "stopped" as const },
      { status: "failed" as const, reason: "tool unavailable" },
    ]) {
      assert.deepEqual(terminationOutcomeSchema.parse(outcome), outcome);
    }
  });
});
