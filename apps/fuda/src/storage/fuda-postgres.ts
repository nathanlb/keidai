import {
  createPool,
  requireDatabaseUrl,
  runMigrations,
  type MigrationResult,
  type Pool,
} from "@keidai/postgres";
import { fudaMigrations } from "./migrations/index.js";
import { validateFudaSchemaIntegrity } from "./validate-schema-integrity.js";

export const FUDA_DATABASE = "FudaDatabase";

export interface OpenFudaDatabaseResult {
  pool: Pool;
  migrations: MigrationResult;
}

export async function openFudaDatabase(
  connectionString: string,
  existingPool?: Pool,
): Promise<OpenFudaDatabaseResult> {
  const pool = existingPool ?? createPool(connectionString);
  const migrations = await runMigrations(pool, fudaMigrations);
  await validateFudaSchemaIntegrity(pool);
  return { pool, migrations };
}

export function resolveFudaDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return requireDatabaseUrl("FUDA_DATABASE_URL", env);
}
