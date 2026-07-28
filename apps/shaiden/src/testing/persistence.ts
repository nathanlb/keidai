import { mkdtempSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Task } from "@keidai/shared";
import { RunStore } from "../runs/run-store.js";
import { SqliteRunRepository } from "../runs/sqlite-run-repository.js";
import { MockRunRepository } from "../runs/testing/mock-run-repository.js";
import { openShaidenDatabase } from "../storage/shaiden-sqlite.js";
import { SqliteTaskRepository } from "../tasks/sqlite-task-repository.js";
import { MockTaskRepository } from "../tasks/testing/mock-task-repository.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";

export interface TestPersistence {
  runStore: RunStore;
  taskRepository: TaskRepository;
  close: () => void;
}

/**
 * Builds Shaiden persistence for tests using a temp SQLite database
 * (the production path).
 */
export function createTestPersistence(): TestPersistence {
  const databasePath = path.join(
    mkdtempSync(path.join(tmpdir(), "shaiden-test-")),
    "shaiden.db",
  );
  const database = openShaidenDatabase(databasePath);
  return {
    runStore: new RunStore(new SqliteRunRepository(database)),
    taskRepository: new SqliteTaskRepository(database),
    close: () => {
      (database as DatabaseSync).close();
    },
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
    close: () => {},
  };
}

export function createTestRun(
  persistence: TestPersistence,
  input: {
    runId: string;
    task?: Task;
    goal?: string;
  },
): string {
  const task = input.task ?? {
    goal: input.goal ?? "Test run goal",
    trigger: { type: "now" as const },
    assignee: "shaiden-newsletter-01",
  };
  const savedTask = persistence.taskRepository.create({ task });
  persistence.runStore.createRun({
    id: input.runId,
    taskId: savedTask.id,
    task,
    assignee: task.assignee,
    goal: task.goal,
  });
  return savedTask.id;
}
