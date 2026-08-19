import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunSseEvent } from "@keidai/shared";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { RunStore } from "../run-store.js";
import { PgRunRepository } from "../pg-run-repository.js";
import { openShaidenDatabase } from "../../storage/shaiden-postgres.js";
import { createTestPersistence, createTestRun } from "../../testing/persistence.js";

const sampleTask = {
  goal: "Draft a note.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
};

describe("RunStore remote event fan-out", () => {
  it("notifies local subscribers when another replica updates a run", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openShaidenDatabase(resolveTestDatabaseUrl(), isolated.pool);
      await isolated.pool.query(
        `
          INSERT INTO tasks (
            id, goal, trigger_json, assignee, limits_json, created_at, updated_at
          ) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7)
        `,
        [
          "task-1",
          sampleTask.goal,
          JSON.stringify(sampleTask.trigger),
          sampleTask.assignee,
          null,
          "2026-07-08T12:00:00.000Z",
          "2026-07-08T12:00:00.000Z",
        ],
      );

      const replicaA = new RunStore(new PgRunRepository(isolated.pool));
      const replicaB = new RunStore(new PgRunRepository(isolated.pool));

      await replicaA.createRun({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
      });
      await replicaA.pollRemoteUpdates();

      const events: RunSseEvent[] = [];
      replicaA.subscribe((event) => events.push(event));

      await replicaB.appendStep("run-1", {
        timestamp: "2026-07-08T12:00:02.000Z",
        kind: "tool_dispatch",
      });
      await replicaA.pollRemoteUpdates();

      assert.equal(events.length, 1);
      assert.equal(events[0]?.run.id, "run-1");
      assert.equal(events[0]?.run.stepCount, 1);
    } finally {
      await isolated.close();
    }
  });

  it("does not emit on the initial watermark snapshot", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      const events: RunSseEvent[] = [];
      persistence.runStore.subscribe((event) => events.push(event));
      await persistence.runStore.pollRemoteUpdates();
      assert.equal(events.length, 0);
    } finally {
      await persistence.close();
    }
  });
});
