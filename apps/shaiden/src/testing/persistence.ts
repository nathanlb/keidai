import { mkdtempSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Task } from "@keidai/shared";
import { RunStore } from "../runs/run-store.js";
import { SqliteRunRepository } from "../runs/sqlite-run-repository.js";
import { InMemoryRunRepository } from "../runs/testing/in-memory-run-repository.js";
import { openShaidenDatabase } from "../storage/shaiden-sqlite.js";
import { SqliteTaskRepository } from "../tasks/sqlite-task-repository.js";
import { InMemoryTaskRepository } from "../tasks/testing/in-memory-task-repository.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";

export type TestPersistenceBackend = "memory" | "sqlite";

export interface TestPersistence {
  runStore: RunStore;
  taskRepository: TaskRepository;
  close: () => void;
}

export function createTestPersistence(
  backend: TestPersistenceBackend = "sqlite",
): TestPersistence {
  if (backend === "memory") {
    return {
      runStore: new RunStore(new InMemoryRunRepository()),
      taskRepository: new InMemoryTaskRepository(),
      close: () => {},
    };
  }

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
