import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openFudaDatabase } from "../fuda-sqlite.js";
import { runMigrations } from "../migrate.js";
import { fudaMigrations } from "../migrations/index.js";
import { DatabaseSync } from "node:sqlite";

function tempDbPath(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "fuda-schema-")), "fuda.db");
}

describe("002_agent_schema migration", () => {
  it("creates agents, persona_versions, bearers, and bearer_agent_grants", () => {
    const { db, migrations } = openFudaDatabase(tempDbPath());

    assert.deepEqual(migrations.applied, [
      "001_baseline",
      "002_agent_schema",
      "003_owners",
    ]);

    const tables = db
      .prepare(
        `
        SELECT name FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
      `,
      )
      .all() as Array<{ name: string }>;

    const names = tables.map((row) => row.name);
    assert.ok(names.includes("agents"));
    assert.ok(names.includes("persona_versions"));
    assert.ok(names.includes("bearers"));
    assert.ok(names.includes("bearer_agent_grants"));
    assert.ok(names.includes("owners"));
  });

  it("enforces slug uniqueness at the database level", () => {
    const { db } = openFudaDatabase(tempDbPath());
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO agents (
        id, slug, name, owner_id, groups_json,
        current_persona_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run("a1", "newsletter", "One", "owner", "[]", 1, now, now);

    assert.throws(
      () =>
        db
          .prepare(
            `
            INSERT INTO agents (
              id, slug, name, owner_id, groups_json,
              current_persona_version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run("a2", "newsletter", "Two", "owner", "[]", 1, now, now),
      /UNIQUE|constraint/i,
    );
  });

  it("is idempotent when re-applied via openFudaDatabase", () => {
    const dbPath = tempDbPath();
    const first = openFudaDatabase(dbPath);
    assert.deepEqual(first.migrations.applied, [
      "001_baseline",
      "002_agent_schema",
      "003_owners",
    ]);
    first.db.close();

    const second = openFudaDatabase(dbPath);
    assert.deepEqual(second.migrations.applied, []);
    assert.deepEqual(second.migrations.alreadyApplied, [
      "001_baseline",
      "002_agent_schema",
      "003_owners",
    ]);
  });

  it("registers migrations in id order", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fuda-mig-order-"));
    const db = new DatabaseSync(path.join(dir, "test.db"));
    db.exec("PRAGMA foreign_keys = ON");
    const result = runMigrations(db, fudaMigrations);
    assert.deepEqual(result.applied, [
      "001_baseline",
      "002_agent_schema",
      "003_owners",
    ]);
  });
});
