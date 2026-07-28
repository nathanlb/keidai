import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  /** Stable id recorded in `schema_migrations` (e.g. `001_baseline`). */
  id: string;
  up: (db: DatabaseSync) => void;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

function listAppliedMigrationIds(db: DatabaseSync): Set<string> {
  const rows = db
    .prepare("SELECT id FROM schema_migrations ORDER BY id ASC")
    .all() as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

/**
 * Applies pending migrations in order. Fail-fast: aborts the batch on the
 * first error and leaves earlier successful migrations recorded.
 */
export function runMigrations(
  db: DatabaseSync,
  migrations: readonly Migration[],
): MigrationResult {
  ensureMigrationsTable(db);

  const ids = migrations.map((migration) => migration.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error("Duplicate migration id in migration list");
  }

  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id));
  const appliedIds = listAppliedMigrationIds(db);
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const migration of sorted) {
    if (appliedIds.has(migration.id)) {
      alreadyApplied.push(migration.id);
      continue;
    }

    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
      ).run(migration.id, new Date().toISOString());
      db.exec("COMMIT");
      applied.push(migration.id);
      appliedIds.add(migration.id);
    } catch (error) {
      db.exec("ROLLBACK");
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.id} failed: ${message}`, {
        cause: error,
      });
    }
  }

  return { applied, alreadyApplied };
}
