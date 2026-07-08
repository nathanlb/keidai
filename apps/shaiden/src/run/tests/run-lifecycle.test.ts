import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSchema } from "@keidai/shared";
import { completeRun, createRun } from "../run-lifecycle.js";

const sampleTask = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
};

describe("run lifecycle", () => {
  it("records exactly one termination outcome per run", () => {
    const started = createRun(
      "run-1",
      sampleTask,
      new Date("2026-07-07T12:00:00.000Z"),
    );
    const completed = completeRun(started, {
      status: "failed",
      reason: "task loop not implemented",
    });

    const parsed = runSchema.parse(completed);
    assert.equal(parsed.outcome.status, "failed");
    if (parsed.outcome.status === "failed") {
      assert.equal(parsed.outcome.reason, "task loop not implemented");
    }
  });
});
