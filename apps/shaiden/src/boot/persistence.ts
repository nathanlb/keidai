import type { DatabaseSync } from "node:sqlite";
import { resolveShaidenDbPath } from "../storage/shaiden-db-path.js";
import { openShaidenDatabase } from "../storage/shaiden-sqlite.js";
import { SqliteRunRepository } from "../runs/sqlite-run-repository.js";
import { RunStore } from "../runs/run-store.js";
import { SqliteTaskRepository } from "../tasks/sqlite-task-repository.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";
import type { RunRepository } from "../runs/types/run-repository.js";

export interface ShaidenPersistence {
  database: DatabaseSync;
  taskRepository: TaskRepository;
  runRepository: RunRepository;
  runStore: RunStore;
}

let persistence: ShaidenPersistence | undefined;

export function createShaidenPersistence(
  databasePath = resolveShaidenDbPath(),
): ShaidenPersistence {
  const database = openShaidenDatabase(databasePath);
  const taskRepository = new SqliteTaskRepository(database);
  const runRepository = new SqliteRunRepository(database);
  const runStore = new RunStore(runRepository);
  return { database, taskRepository, runRepository, runStore };
}

export function getShaidenPersistence(): ShaidenPersistence {
  persistence ??= createShaidenPersistence();
  return persistence;
}
