import type { Pool } from "@keidai/postgres";
import {
  openShaidenDatabase,
  resolveShaidenDatabaseUrl,
} from "../storage/shaiden-postgres.js";
import { PgRunRepository } from "../runs/pg-run-repository.js";
import { RunStore } from "../runs/run-store.js";
import { PgTaskRepository } from "../tasks/pg-task-repository.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";
import type { RunRepository } from "../runs/types/run-repository.js";

export interface ShaidenPersistence {
  pool: Pool;
  taskRepository: TaskRepository;
  runRepository: RunRepository;
  runStore: RunStore;
}

let persistencePromise: Promise<ShaidenPersistence> | undefined;

export async function createShaidenPersistence(
  connectionString = resolveShaidenDatabaseUrl(),
  existingPool?: Pool,
): Promise<ShaidenPersistence> {
  const { pool } = await openShaidenDatabase(connectionString, existingPool);
  const taskRepository = new PgTaskRepository(pool);
  const runRepository = new PgRunRepository(pool);
  const runStore = new RunStore(runRepository);
  return { pool, taskRepository, runRepository, runStore };
}

export function getShaidenPersistence(): Promise<ShaidenPersistence> {
  persistencePromise ??= createShaidenPersistence();
  return persistencePromise;
}
