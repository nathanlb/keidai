import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { RunSseEvent } from "@keidai/shared";
import { RunStore } from "../run-store.js";
import { SqliteRunRepository } from "../sqlite-run-repository.js";
import { openShaidenDatabase } from "../../storage/shaiden-sqlite.js";
import { createTestPersistence, createTestRun } from "../../testing/persistence.js";

const sampleTask = {
  goal: "Draft a note.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
};

describe("RunStore remote event fan-out", () => {
  it("notifies local subscribers when another replica updates a run", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-events-")),
      "shaiden.db",
    );
    const setup = openShaidenDatabase(databasePath);
    setup.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: null,
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });
    setup.close();

    const replicaA = new RunStore(
      new SqliteRunRepository(openShaidenDatabase(databasePath)),
    );
    const replicaB = new RunStore(
      new SqliteRunRepository(openShaidenDatabase(databasePath)),
    );

    replicaA.createRun({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
    });
    replicaA.pollRemoteUpdates();

    const events: RunSseEvent[] = [];
    replicaA.subscribe((event) => events.push(event));

    replicaB.appendStep("run-1", {
      timestamp: "2026-07-08T12:00:02.000Z",
      kind: "tool_dispatch",
    });
    replicaA.pollRemoteUpdates();

    assert.equal(events.length, 1);
    assert.equal(events[0]?.run.id, "run-1");
    assert.equal(events[0]?.run.stepCount, 1);
  });

  it("does not emit on the initial watermark snapshot", () => {
    const persistence = createTestPersistence();
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      const events: RunSseEvent[] = [];
      persistence.runStore.subscribe((event) => events.push(event));
      persistence.runStore.pollRemoteUpdates();
      assert.equal(events.length, 0);
    } finally {
      persistence.close();
    }
  });
});
