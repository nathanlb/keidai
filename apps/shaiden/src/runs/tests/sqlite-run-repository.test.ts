import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openShaidenDatabase } from "../../storage/shaiden-sqlite.js";
import { SqliteRunRepository } from "../sqlite-run-repository.js";

const sampleTask = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

function createRepository(databasePath: string): SqliteRunRepository {
  return new SqliteRunRepository(openShaidenDatabase(databasePath));
}

describe("SqliteRunRepository", () => {
  it("appends steps, completes runs, and persists across instances", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    const created = repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });
    assert.equal(created.taskId, "task-1");
    assert.equal(created.status, "running");

    repository.appendStep("run-1", {
      id: "step-1",
      timestamp: "2026-07-08T12:00:01.000Z",
      kind: "model",
      text: "planning",
    });

    const completed = repository.complete("run-1", {
      outcome: { status: "goal_met" },
    });
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.steps.length, 1);

    const secondRepository = createRepository(databasePath);
    const loaded = secondRepository.get("run-1");
    assert.equal(loaded?.task.goal, sampleTask.goal);
    assert.equal(loaded?.outcome?.status, "goal_met");
  });
});
