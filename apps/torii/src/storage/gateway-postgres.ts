import {
  createPool,
  ensureWeeklyPartitions,
  requireDatabaseUrl,
  runMigrations,
  shouldAutoMigrate,
  type MigrationResult,
  type Pool,
} from "@keidai/postgres";
import { toriiMigrations } from "./migrations/index.js";

export const TORII_DATABASE = "ToriiDatabase";

export interface OpenGatewayDatabaseResult {
  pool: Pool;
  migrations: MigrationResult;
}

export interface OpenGatewayDatabaseOptions {
  pool?: Pool;
  /** Override env `KEIDAI_AUTO_MIGRATE`. Migrate CLI always passes true. */
  migrate?: boolean;
}

export async function openGatewayDatabase(
  connectionString: string,
  existingPoolOrOptions?: Pool | OpenGatewayDatabaseOptions,
): Promise<OpenGatewayDatabaseResult> {
  const options: OpenGatewayDatabaseOptions =
    existingPoolOrOptions &&
    typeof existingPoolOrOptions === "object" &&
    "query" in existingPoolOrOptions
      ? { pool: existingPoolOrOptions }
      : ((existingPoolOrOptions as OpenGatewayDatabaseOptions | undefined) ?? {});
  const pool = options.pool ?? createPool(connectionString);
  const migrate = options.migrate ?? shouldAutoMigrate();
  const migrations = migrate
    ? await runMigrations(pool, toriiMigrations)
    : { applied: [], alreadyApplied: [] };
  await ensureWeeklyPartitions(pool, "call_traces", new Date(), 1);
  return { pool, migrations };
}

/** Apply pending Torii migrations (Helm migrate Job). */
export async function migrateGatewayDatabase(
  connectionString: string,
  existingPool?: Pool,
): Promise<MigrationResult> {
  const { pool, migrations } = await openGatewayDatabase(connectionString, {
    pool: existingPool,
    migrate: true,
  });
  if (!existingPool) {
    await pool.end();
  }
  return migrations;
}

export function resolveToriiDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return requireDatabaseUrl("TORII_DATABASE_URL", env);
}
