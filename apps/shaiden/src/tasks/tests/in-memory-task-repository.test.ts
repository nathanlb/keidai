import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryTaskRepository } from "../in-memory-task-repository.js";

const sampleTask = {
  goal: "Ship the newsletter",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
};

describe("InMemoryTaskRepository", () => {
  it("creates and updates tasks", () => {
    const repository = new InMemoryTaskRepository();
    const created = repository.create({ task: sampleTask });
    assert.equal(created.goal, sampleTask.goal);

    const updated = repository.update(created.id, { goal: "Updated" });
    assert.equal(updated?.goal, "Updated");
  });
});
