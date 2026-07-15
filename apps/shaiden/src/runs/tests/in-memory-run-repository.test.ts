import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryRunRepository } from "../testing/in-memory-run-repository.js";

const sampleTask = {
  goal: "Ship the newsletter",
  trigger: { type: "now" as const },
  assignee: "agent-1",
};

describe("InMemoryRunRepository", () => {
  it("appends steps and completes a run", () => {
    const repository = new InMemoryRunRepository();
    const created = repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
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

  it("begins a continuation from a terminal run with persisted history", () => {
    const repository = new InMemoryRunRepository();
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: "agent-1",
      goal: "Ship the newsletter",
      startedAt: "2026-07-08T12:00:00.000Z",
    });
    repository.setConversationHistory("run-1", [
      { role: "user", text: "goal" },
      { role: "assistant", text: "failed attempt", toolCalls: [] },
    ]);
    repository.complete("run-1", {
      outcome: { status: "failed", reason: "tool error" },
    });

    const result = repository.beginContinuation(
      "run-1",
      "try again",
      {
        id: "step-follow-up",
        timestamp: "2026-07-08T12:00:02.000Z",
        kind: "user_message",
        text: "try again",
      },
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      const lastEntry = result.history.at(-1);
      assert.equal(lastEntry?.role, "user");
      if (lastEntry?.role === "user") {
        assert.equal(lastEntry.text, "try again");
      }
    }

    const reopened = repository.get("run-1");
    assert.equal(reopened?.status, "running");
    assert.equal(reopened?.outcome, undefined);
    assert.equal(reopened?.steps.at(-1)?.kind, "user_message");
  });

  it("rejects continuation without persisted history", () => {
    const repository = new InMemoryRunRepository();
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: "agent-1",
      goal: "Ship the newsletter",
      startedAt: "2026-07-08T12:00:00.000Z",
    });
    repository.complete("run-1", { outcome: { status: "goal_met" } });

    const result = repository.beginContinuation(
      "run-1",
      "summarize",
      {
        id: "step-follow-up",
        timestamp: "2026-07-08T12:00:02.000Z",
        kind: "user_message",
        text: "summarize",
      },
    );

    assert.deepEqual(result, { ok: false, reason: "missing_history" });
  });
});
