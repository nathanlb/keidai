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
      assert.equal(created.nextRunAt, null);

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

  it("stores next_run_at for a schedule and claims due rows without moving the cursor", async () => {
    const { repository, close } = await createRepository();
    try {
      const created = await repository.create({
        task: {
          goal: "Nightly digest",
          trigger: {
            type: "schedule",
            timezone: "UTC",
            at: "2020-01-01T00:00",
            recurrence: { freq: "daily" },
          },
          assignee: "shaiden-newsletter-01",
        },
      });
      assert.ok(created.nextRunAt);
      const dueAt = new Date(Date.now() - 1_000).toISOString();
      await repository.setNextRunAt(created.id, dueAt);

      const claimed = await repository.claimDueTasks({
        now: new Date(),
        claimUntil: new Date(Date.now() + 30_000),
      });
      assert.equal(claimed.length, 1);
      assert.equal(claimed[0]?.id, created.id);
      assert.equal(claimed[0]?.nextRunAt, dueAt);

      const afterClaim = await repository.get(created.id);
      assert.equal(afterClaim?.nextRunAt, dueAt);

      const secondClaim = await repository.claimDueTasks({
        now: new Date(),
        claimUntil: new Date(Date.now() + 30_000),
      });
      assert.equal(secondClaim.length, 0);

      await repository.recordScheduleSuccess({
        taskId: created.id,
        nextRunAt: null,
      });
      assert.equal(await repository.peekMinNextRunAt(), null);
    } finally {
      await close();
    }
  });

  it("keeps an overdue cursor when the trigger does not change", async () => {
    const { repository, close } = await createRepository();
    try {
      const created = await repository.create({
        task: {
          goal: "Nightly digest",
          trigger: {
            type: "schedule",
            timezone: "UTC",
            at: "2020-01-01T00:00",
            recurrence: { freq: "daily" },
          },
          assignee: "shaiden-newsletter-01",
        },
      });
      const dueAt = new Date(Date.now() - 60_000).toISOString();
      await repository.setNextRunAt(created.id, dueAt);

      const updated = await repository.update(created.id, {
        goal: "Updated nightly digest",
      });
      assert.equal(updated?.nextRunAt, dueAt);
    } finally {
      await close();
    }
  });

  it("fails the schedule after two start failures", async () => {
    const { repository, close } = await createRepository();
    try {
      const created = await repository.create({
        task: {
          goal: "Nightly digest",
          trigger: {
            type: "schedule",
            timezone: "UTC",
            at: "2020-01-01T00:00",
            recurrence: { freq: "daily" },
          },
          assignee: "shaiden-newsletter-01",
        },
      });
      const dueAt = new Date(Date.now() - 1_000).toISOString();
      await repository.setNextRunAt(created.id, dueAt);
      const now = new Date();

      assert.equal(
        await repository.recordScheduleStartFailure({
          taskId: created.id,
          error: "boom",
          retryUntil: new Date(now.getTime() + 30_000),
          now,
        }),
        "retry",
      );
      assert.equal((await repository.get(created.id))?.nextRunAt, dueAt);

      assert.equal(
        await repository.recordScheduleStartFailure({
          taskId: created.id,
          error: "boom",
          retryUntil: new Date(now.getTime() + 30_000),
          now,
        }),
        "failed",
      );
      const failed = await repository.get(created.id);
      assert.equal(failed?.nextRunAt, null);
      assert.ok(failed?.scheduleFailedAt);
      assert.equal(failed?.scheduleError, "boom");
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
