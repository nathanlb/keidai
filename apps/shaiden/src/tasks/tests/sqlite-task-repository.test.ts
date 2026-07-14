import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openShaidenDatabase } from "../../storage/shaiden-sqlite.js";
import { SqliteTaskRepository } from "../sqlite-task-repository.js";

const sampleTask = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

function createRepository(databasePath: string): SqliteTaskRepository {
  return new SqliteTaskRepository(openShaidenDatabase(databasePath));
}

describe("SqliteTaskRepository", () => {
  it("creates, lists, updates, and deletes tasks", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-task-store-")),
      "shaiden.db",
    );
    const repository = createRepository(databasePath);

    const created = repository.create({ task: sampleTask });
    assert.equal(created.goal, sampleTask.goal);
    assert.ok(created.id);

    const listed = repository.list();
    assert.equal(listed.tasks.length, 1);
    assert.equal(listed.tasks[0]?.id, created.id);

    const updated = repository.update(created.id, {
      goal: "Updated goal",
    });
    assert.equal(updated?.goal, "Updated goal");

    assert.equal(repository.delete(created.id), true);
    assert.equal(repository.get(created.id), null);
  });

  it("persists tasks across repository instances", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-task-store-")),
      "shaiden.db",
    );
    const firstRepository = createRepository(databasePath);
    const created = firstRepository.create({ task: sampleTask });

    const secondRepository = createRepository(databasePath);
    assert.equal(secondRepository.get(created.id)?.goal, sampleTask.goal);
  });
});
