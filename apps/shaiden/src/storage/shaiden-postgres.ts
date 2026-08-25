import {
  createPool,
  defaultPartitionRetentionMs,
  dropWeeklyPartitionsOlderThan,
  ensureWeeklyPartitions,
  requireDatabaseUrl,
  runMigrations,
  shouldAutoMigrate,
  type MigrationResult,
  type Pool,
} from "@keidai/postgres";
import { shaidenMigrations } from "./migrations/index.js";

export const SHAIDEN_DATABASE = "ShaidenDatabase";

export interface OpenShaidenDatabaseResult {
  pool: Pool;
  migrations: MigrationResult;
}

export interface OpenShaidenDatabaseOptions {
  pool?: Pool;
  /** Override env `KEIDAI_AUTO_MIGRATE`. Migrate CLI always passes true. */
  migrate?: boolean;
}

export async function openShaidenDatabase(
  connectionString: string,
  existingPoolOrOptions?: Pool | OpenShaidenDatabaseOptions,
): Promise<OpenShaidenDatabaseResult> {
  const options: OpenShaidenDatabaseOptions =
    existingPoolOrOptions &&
    typeof existingPoolOrOptions === "object" &&
    "query" in existingPoolOrOptions
      ? { pool: existingPoolOrOptions }
      : ((existingPoolOrOptions as OpenShaidenDatabaseOptions | undefined) ?? {});
  const pool = options.pool ?? createPool(connectionString);
  const migrate = options.migrate ?? shouldAutoMigrate();
  const migrations = migrate
    ? await runMigrations(pool, shaidenMigrations)
    : { applied: [], alreadyApplied: [] };
  await ensureWeeklyPartitions(pool, "run_steps", new Date(), 1);
  await dropWeeklyPartitionsOlderThan(
    pool,
    "run_steps",
    new Date(Date.now() - defaultPartitionRetentionMs()),
  );
  return { pool, migrations };
}

/** Apply pending Shaiden migrations (Helm migrate Job). */
export async function migrateShaidenDatabase(
  connectionString: string,
  existingPool?: Pool,
): Promise<MigrationResult> {
  const { pool, migrations } = await openShaidenDatabase(connectionString, {
    pool: existingPool,
    migrate: true,
  });
  if (!existingPool) {
    await pool.end();
  }
  return migrations;
}

export function resolveShaidenDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return requireDatabaseUrl("SHAIDEN_DATABASE_URL", env);
}
