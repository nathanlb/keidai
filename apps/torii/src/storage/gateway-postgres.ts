import {
  createPool,
  ensureWeeklyPartitions,
  requireDatabaseUrl,
  runMigrations,
  type MigrationResult,
  type Pool,
} from "@keidai/postgres";
import { toriiMigrations } from "./migrations/index.js";

export const TORII_DATABASE = "ToriiDatabase";

export interface OpenGatewayDatabaseResult {
  pool: Pool;
  migrations: MigrationResult;
}

export async function openGatewayDatabase(
  connectionString: string,
  existingPool?: Pool,
): Promise<OpenGatewayDatabaseResult> {
  const pool = existingPool ?? createPool(connectionString);
  const migrations = await runMigrations(pool, toriiMigrations);
  await ensureWeeklyPartitions(pool, "call_traces", new Date(), 1);
  return { pool, migrations };
}

export function resolveToriiDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return requireDatabaseUrl("TORII_DATABASE_URL", env);
}
