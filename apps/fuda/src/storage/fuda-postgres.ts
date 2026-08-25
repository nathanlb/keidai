import {
  createPool,
  requireDatabaseUrl,
  runMigrations,
  shouldAutoMigrate,
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

export interface OpenFudaDatabaseOptions {
  pool?: Pool;
  /** Override env `KEIDAI_AUTO_MIGRATE`. Migrate CLI always passes true. */
  migrate?: boolean;
}

export async function openFudaDatabase(
  connectionString: string,
  existingPoolOrOptions?: Pool | OpenFudaDatabaseOptions,
): Promise<OpenFudaDatabaseResult> {
  const options: OpenFudaDatabaseOptions =
    existingPoolOrOptions &&
    typeof existingPoolOrOptions === "object" &&
    "query" in existingPoolOrOptions
      ? { pool: existingPoolOrOptions }
      : ((existingPoolOrOptions as OpenFudaDatabaseOptions | undefined) ?? {});
  const pool = options.pool ?? createPool(connectionString);
  const migrate = options.migrate ?? shouldAutoMigrate();
  const migrations = migrate
    ? await runMigrations(pool, fudaMigrations)
    : { applied: [], alreadyApplied: [] };
  await validateFudaSchemaIntegrity(pool);
  return { pool, migrations };
}

/** Apply pending Fuda migrations and exit-friendly result (Helm migrate Job). */
export async function migrateFudaDatabase(
  connectionString: string,
  existingPool?: Pool,
): Promise<MigrationResult> {
  const { pool, migrations } = await openFudaDatabase(connectionString, {
    pool: existingPool,
    migrate: true,
  });
  if (!existingPool) {
    await pool.end();
  }
  return migrations;
}

export function resolveFudaDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return requireDatabaseUrl("FUDA_DATABASE_URL", env);
}
