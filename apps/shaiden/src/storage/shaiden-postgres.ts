import {
  createPool,
  defaultPartitionRetentionMs,
  dropWeeklyPartitionsOlderThan,
  ensureWeeklyPartitions,
  requireDatabaseUrl,
  runMigrations,
  type MigrationResult,
  type Pool,
} from "@keidai/postgres";
import { shaidenMigrations } from "./migrations/index.js";

export const SHAIDEN_DATABASE = "ShaidenDatabase";

export interface OpenShaidenDatabaseResult {
  pool: Pool;
  migrations: MigrationResult;
}

export async function openShaidenDatabase(
  connectionString: string,
  existingPool?: Pool,
): Promise<OpenShaidenDatabaseResult> {
  const pool = existingPool ?? createPool(connectionString);
  const migrations = await runMigrations(pool, shaidenMigrations);
  await ensureWeeklyPartitions(pool, "run_steps", new Date(), 1);
  await dropWeeklyPartitionsOlderThan(
    pool,
    "run_steps",
    new Date(Date.now() - defaultPartitionRetentionMs()),
  );
  return { pool, migrations };
}

export function resolveShaidenDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return requireDatabaseUrl("SHAIDEN_DATABASE_URL", env);
}
