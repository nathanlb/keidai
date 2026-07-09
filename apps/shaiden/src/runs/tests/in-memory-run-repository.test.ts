import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryRunRepository } from "../in-memory-run-repository.js";

describe("InMemoryRunRepository", () => {
  it("appends steps and completes a run", () => {
    const repository = new InMemoryRunRepository();
    const created = repository.create({
      id: "run-1",
      assignee: "agent-1",
      goal: "Ship the newsletter",
      startedAt: "2026-07-08T12:00:00.000Z",
    });

    assert.equal(created.status, "running");
    assert.equal(created.stepCount, 0);

    const withStep = repository.appendStep("run-1", {
      id: "step-1",
      timestamp: "2026-07-08T12:00:01.000Z",
      kind: "model",
      text: "planning",
    });
    assert.equal(withStep?.stepCount, 1);
    assert.equal(withStep?.steps[0]?.kind, "model");

    const completed = repository.complete("run-1", {
      outcome: { status: "goal_met" },
    });
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.outcome?.status, "goal_met");
  });
});
