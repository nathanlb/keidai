import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockRunRepository } from "../testing/mock-run-repository.js";
import { TaskAlreadyRunningError } from "../types/run-repository.js";

const sampleTask = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
};

describe("MockRunRepository", () => {
  it("rejects a second running run for the same task and allows another task", async () => {
    const repository = new MockRunRepository();
    await repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });

    await assert.rejects(
      () =>
        repository.create({
          id: "run-1b",
          taskId: "task-1",
          task: sampleTask,
          assignee: sampleTask.assignee,
          goal: sampleTask.goal,
          startedAt: "2026-07-08T12:00:01.000Z",
        }),
      (error: unknown) => error instanceof TaskAlreadyRunningError,
    );

    await repository.create({
      id: "run-2",
      taskId: "task-2",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:02.000Z",
    });
    assert.deepEqual(await repository.listRunningRuns(), [
      { id: "run-1", taskId: "task-1" },
      { id: "run-2", taskId: "task-2" },
    ]);

    await repository.complete("run-1", { outcome: { status: "goal_met" } });
    await repository.create({
      id: "run-1c",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:02:00.000Z",
    });
    assert.deepEqual(await repository.listRunningRuns(), [
      { id: "run-2", taskId: "task-2" },
      { id: "run-1c", taskId: "task-1" },
    ]);
  });
});
