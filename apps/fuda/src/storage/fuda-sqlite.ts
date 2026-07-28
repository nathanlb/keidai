import { DatabaseSync } from "node:sqlite";
import { runMigrations, type MigrationResult } from "./migrate.js";
import { fudaMigrations } from "./migrations/index.js";

export interface OpenFudaDatabaseResult {
  db: DatabaseSync;
  migrations: MigrationResult;
}

export function openFudaDatabase(databasePath: string): OpenFudaDatabaseResult {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  const migrations = runMigrations(db, fudaMigrations);
  return { db, migrations };
}
