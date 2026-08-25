import type { Pool } from "pg";
import type { Queryable } from "./pool.js";

export interface Migration {
  /** Stable id recorded in `schema_migrations` (e.g. `001_baseline`). */
  id: string;
  up: (queryable: Queryable) => Promise<void>;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

/**
 * Whether app boot should run migrations.
 *
 * Defaults to true (Compose / local). Helm chart Deployments set
 * `KEIDAI_AUTO_MIGRATE=false` so schema changes run only via the
 * pre-upgrade migrate Job — not as a silent boot side effect.
 */
export function shouldAutoMigrate(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.KEIDAI_AUTO_MIGRATE?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw !== "false" && raw !== "0" && raw !== "no";
}

async function ensureMigrationsTable(queryable: Queryable): Promise<void> {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT NOT NULL PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL
    )
  `);
}

async function listAppliedMigrationIds(queryable: Queryable): Promise<Set<string>> {
  const result = await queryable.query<{ id: string }>(
    "SELECT id FROM schema_migrations ORDER BY id ASC",
  );
  return new Set(result.rows.map((row) => row.id));
}

/**
 * Applies pending migrations in order. Fail-fast: aborts the batch on the
 * first error and leaves earlier successful migrations recorded.
 */
export async function runMigrations(
  pool: Pool,
  migrations: readonly Migration[],
): Promise<MigrationResult> {
  await ensureMigrationsTable(pool);

  const ids = migrations.map((migration) => migration.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error("Duplicate migration id in migration list");
  }

  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id));
  const appliedIds = await listAppliedMigrationIds(pool);
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const migration of sorted) {
    if (appliedIds.has(migration.id)) {
      alreadyApplied.push(migration.id);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await migration.up(client);
      await client.query(
        "INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)",
        [migration.id, new Date().toISOString()],
      );
      await client.query("COMMIT");
      applied.push(migration.id);
      appliedIds.add(migration.id);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.id} failed: ${message}`, {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  return { applied, alreadyApplied };
}
