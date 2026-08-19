import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
  type IsolatedSchema,
  type Pool,
} from "@keidai/postgres";
import type { Task } from "@keidai/shared";
import { RunStore } from "../runs/run-store.js";
import { PgRunRepository } from "../runs/pg-run-repository.js";
import { MockRunRepository } from "../runs/testing/mock-run-repository.js";
import { openShaidenDatabase } from "../storage/shaiden-postgres.js";
import { PgTaskRepository } from "../tasks/pg-task-repository.js";
import { MockTaskRepository } from "../tasks/testing/mock-task-repository.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";

export interface TestPersistence {
  runStore: RunStore;
  taskRepository: TaskRepository;
  pool: Pool;
  close: () => Promise<void>;
}

/**
 * Builds Shaiden persistence for tests using an isolated Postgres schema
 * (the production path).
 */
export async function createTestPersistence(): Promise<TestPersistence> {
  const isolated: IsolatedSchema = await createIsolatedSchema();
  await openShaidenDatabase(resolveTestDatabaseUrl(), isolated.pool);
  return {
    runStore: new RunStore(new PgRunRepository(isolated.pool)),
    taskRepository: new PgTaskRepository(isolated.pool),
    pool: isolated.pool,
    close: () => isolated.close(),
  };
}

/**
 * In-process mock persistence for live eval harnesses that do not need
 * durable storage. Prefer {@link createTestPersistence} for automated tests.
 */
export function createEvalPersistence(): TestPersistence {
  return {
    runStore: new RunStore(new MockRunRepository()),
    taskRepository: new MockTaskRepository(),
    pool: {
      query: async () => ({ rows: [{ "?column?": 1 }], rowCount: 1 }),
    } as unknown as Pool,
    close: async () => {},
  };
}

export async function createTestRun(
  persistence: TestPersistence,
  input: {
    runId: string;
    task?: Task;
    goal?: string;
  },
): Promise<string> {
  const task = input.task ?? {
    goal: input.goal ?? "Test run goal",
    trigger: { type: "now" as const },
    assignee: "shaiden-newsletter-01",
  };
  const savedTask = await persistence.taskRepository.create({ task });
  await persistence.runStore.createRun({
    id: input.runId,
    taskId: savedTask.id,
    task,
    assignee: task.assignee,
    goal: task.goal,
  });
  return savedTask.id;
}
