import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger, Task } from "@keidai/shared";
import { RunStore } from "../../runs/run-store.js";
import { MockRunRepository } from "../../runs/testing/mock-run-repository.js";
import { TaskAlreadyRunningError } from "../../runs/types/run-repository.js";
import { MockTaskRepository } from "../../tasks/testing/mock-task-repository.js";
import {
  fireDueScheduledTasks,
  scheduleSleepMs,
} from "../schedule-dispatcher.js";

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const dailyUtc = {
  type: "schedule" as const,
  timezone: "UTC",
  at: "2020-01-01T00:00",
  recurrence: { freq: "daily" as const },
};

const fireAt = new Date("2026-08-31T12:00:00.000Z");
const dueAt = "2026-08-31T00:00:00.000Z";

async function createDueTask(
  taskRepository: MockTaskRepository,
  trigger: Task["trigger"] = dailyUtc,
) {
  const saved = await taskRepository.create({
    task: {
      goal: "Nightly",
      trigger,
      assignee: "agt-1",
    },
  });
  await taskRepository.setNextRunAt(saved.id, dueAt);
  return saved;
}

describe("scheduleSleepMs", () => {
  it("caps idle wait and wakes immediately when due", () => {
    assert.equal(scheduleSleepMs(null, 0, 30_000, 50), 30_000);
    assert.equal(
      scheduleSleepMs(
        "2026-01-01T00:00:10.000Z",
        Date.parse("2026-01-01T00:00:00.000Z"),
        30_000,
        50,
      ),
      10_000,
    );
    assert.equal(
      scheduleSleepMs(
        "2026-01-01T00:00:00.000Z",
        Date.parse("2026-01-01T00:00:05.000Z"),
        30_000,
        50,
      ),
      50,
    );
  });
});

describe("fireDueScheduledTasks", () => {
  it("starts a due task and jumps the schedule forward", async () => {
    const taskRepository = new MockTaskRepository();
    const runStore = new RunStore(new MockRunRepository());
    const started: string[] = [];
    const saved = await createDueTask(taskRepository);

    const count = await fireDueScheduledTasks({
      taskRepository,
      runStore,
      startTaskRun: async ({ taskId }) => {
        started.push(taskId);
      },
      logger: silentLogger,
      now: () => fireAt,
    });

    assert.equal(count, 1);
    assert.deepEqual(started, [saved.id]);
    const after = await taskRepository.get(saved.id);
    assert.equal(after?.nextRunAt, "2026-09-01T00:00:00.000Z");
  });

  it("defers when an older run is still in flight", async () => {
    const taskRepository = new MockTaskRepository();
    const runStore = new RunStore(new MockRunRepository());
    const saved = await createDueTask(taskRepository);
    const task: Task = {
      goal: saved.goal,
      trigger: saved.trigger,
      assignee: saved.assignee,
    };
    await runStore.createRun({
      id: "run-busy",
      taskId: saved.id,
      task,
      assignee: saved.assignee,
      goal: saved.goal,
      startedAt: "2026-08-30T00:00:00.000Z",
    });

    let started = 0;
    const count = await fireDueScheduledTasks({
      taskRepository,
      runStore,
      startTaskRun: async () => {
        started += 1;
      },
      logger: silentLogger,
      now: () => fireAt,
    });

    assert.equal(count, 0);
    assert.equal(started, 0);
    const after = await taskRepository.get(saved.id);
    assert.equal(after?.nextRunAt, dueAt);
  });

  it("advances when a run already covers this slot", async () => {
    const taskRepository = new MockTaskRepository();
    const runStore = new RunStore(new MockRunRepository());
    const saved = await createDueTask(taskRepository);
    const task: Task = {
      goal: saved.goal,
      trigger: saved.trigger,
      assignee: saved.assignee,
    };
    await runStore.createRun({
      id: "run-this-slot",
      taskId: saved.id,
      task,
      assignee: saved.assignee,
      goal: saved.goal,
      startedAt: dueAt,
    });

    const count = await fireDueScheduledTasks({
      taskRepository,
      runStore,
      startTaskRun: async () => {
        throw new Error("should not start");
      },
      logger: silentLogger,
      now: () => fireAt,
    });

    assert.equal(count, 0);
    const after = await taskRepository.get(saved.id);
    assert.equal(after?.nextRunAt, "2026-09-01T00:00:00.000Z");
  });

  it("retries a failed start once, then stops the schedule", async () => {
    const taskRepository = new MockTaskRepository();
    const runStore = new RunStore(new MockRunRepository());
    const saved = await createDueTask(taskRepository);

    await fireDueScheduledTasks({
      taskRepository,
      runStore,
      startTaskRun: async () => {
        throw new Error("boom");
      },
      logger: silentLogger,
      now: () => fireAt,
      claimMs: 30_000,
    });

    const afterFirst = await taskRepository.get(saved.id);
    assert.equal(afterFirst?.nextRunAt, dueAt);
    assert.equal(afterFirst?.scheduleFailedAt, undefined);

    await fireDueScheduledTasks({
      taskRepository,
      runStore,
      startTaskRun: async () => {
        throw new Error("boom");
      },
      logger: silentLogger,
      now: () => new Date(fireAt.getTime() + 30_000),
      claimMs: 30_000,
    });

    const afterSecond = await taskRepository.get(saved.id);
    assert.equal(afterSecond?.nextRunAt, null);
    assert.equal(afterSecond?.scheduleFailedAt, "2026-08-31T12:00:30.000Z");
    assert.equal(afterSecond?.scheduleError, "boom");
  });

  it("treats TaskAlreadyRunningError as skip-busy", async () => {
    const taskRepository = new MockTaskRepository();
    const runStore = new RunStore(new MockRunRepository());
    const saved = await createDueTask(taskRepository);

    const count = await fireDueScheduledTasks({
      taskRepository,
      runStore,
      startTaskRun: async () => {
        throw new TaskAlreadyRunningError(saved.id);
      },
      logger: silentLogger,
      now: () => fireAt,
    });

    assert.equal(count, 0);
    const after = await taskRepository.get(saved.id);
    assert.equal(after?.nextRunAt, "2026-09-01T00:00:00.000Z");
  });

  it("clears next_run_at after firing a one-shot", async () => {
    const taskRepository = new MockTaskRepository();
    const runStore = new RunStore(new MockRunRepository());
    const saved = await createDueTask(taskRepository, {
      type: "schedule",
      timezone: "UTC",
      at: "2026-08-01T00:00",
    });

    await fireDueScheduledTasks({
      taskRepository,
      runStore,
      startTaskRun: async () => {},
      logger: silentLogger,
      now: () => fireAt,
    });

    const after = await taskRepository.get(saved.id);
    assert.equal(after?.nextRunAt, null);
  });

  it("does not start a task archived after claim", async () => {
    class ArchiveOnClaimRepository extends MockTaskRepository {
      override async claimDueTasks(
        input: Parameters<MockTaskRepository["claimDueTasks"]>[0],
      ) {
        const due = await super.claimDueTasks(input);
        for (const task of due) {
          await this.archive(task.id);
        }
        return due;
      }
    }

    const taskRepository = new ArchiveOnClaimRepository();
    const runStore = new RunStore(new MockRunRepository());
    await createDueTask(taskRepository);
    let started = 0;
    const count = await fireDueScheduledTasks({
      taskRepository,
      runStore,
      startTaskRun: async () => {
        started += 1;
      },
      logger: silentLogger,
      now: () => fireAt,
    });
    assert.equal(count, 0);
    assert.equal(started, 0);
  });
});
