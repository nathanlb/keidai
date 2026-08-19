import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { openShaidenDatabase } from "../../storage/shaiden-postgres.js";
import { PgTaskRepository } from "../pg-task-repository.js";

const sampleTask = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

async function createRepository() {
  const isolated = await createIsolatedSchema();
  await openShaidenDatabase(resolveTestDatabaseUrl(), isolated.pool);
  return {
    repository: new PgTaskRepository(isolated.pool),
    close: isolated.close,
  };
}

describe("PgTaskRepository", () => {
  it("creates, lists, updates, archives, and hard-deletes tasks", async () => {
    const { repository, close } = await createRepository();
    try {
      const created = await repository.create({ task: sampleTask });
      assert.equal(created.goal, sampleTask.goal);
      assert.ok(created.id);

      const listed = await repository.list();
      assert.equal(listed.tasks.length, 1);
      assert.equal(listed.tasks[0]?.id, created.id);

      const updated = await repository.update(created.id, {
        goal: "Updated goal",
      });
      assert.equal(updated?.goal, "Updated goal");

      assert.equal(await repository.archive(created.id), true);
      assert.equal((await repository.list()).tasks.length, 0);
      const archived = await repository.get(created.id);
      assert.ok(archived?.archivedAt);

      assert.equal(await repository.archive(created.id), false);
      assert.equal(await repository.delete(created.id), true);
      assert.equal(await repository.get(created.id), null);
    } finally {
      await close();
    }
  });

  it("persists tasks across repository instances", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openShaidenDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const firstRepository = new PgTaskRepository(isolated.pool);
      const created = await firstRepository.create({ task: sampleTask });

      const secondRepository = new PgTaskRepository(isolated.pool);
      assert.equal((await secondRepository.get(created.id))?.goal, sampleTask.goal);
    } finally {
      await isolated.close();
    }
  });
});
