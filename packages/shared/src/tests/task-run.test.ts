import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TASK_LIMITS,
  resolveTaskLimits,
  taskSchema,
  terminationOutcomeSchema,
  type Task,
} from "../index.js";

const sampleTask: Task = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" },
  assignee: "shaiden-newsletter-01",
};

describe("task schema", () => {
  it("accepts a v0 task with the four required fields", () => {
    const parsed = taskSchema.parse(sampleTask);
    assert.equal(parsed.goal, sampleTask.goal);
    assert.deepEqual(parsed.trigger, { type: "now" });
    assert.equal(parsed.assignee, sampleTask.assignee);
  });

  it("rejects trigger variants other than now", () => {
    assert.throws(() =>
      taskSchema.parse({
        ...sampleTask,
        trigger: { type: "cron", schedule: "0 9 * * 1" },
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

describe("termination taxonomy", () => {
  it("accepts each v0 outcome variant", () => {
    for (const outcome of [
      { status: "goal_met" as const },
      { status: "iteration_exhausted" as const },
      { status: "timeout" as const },
      { status: "human_reject" as const },
      { status: "failed" as const, reason: "tool unavailable" },
    ]) {
      assert.deepEqual(terminationOutcomeSchema.parse(outcome), outcome);
    }
  });
});
