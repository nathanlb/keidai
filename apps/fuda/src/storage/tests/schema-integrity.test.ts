import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openFudaDatabase } from "../fuda-sqlite.js";
import {
  SchemaIntegrityError,
  validateFudaSchemaIntegrity,
} from "../validate-schema-integrity.js";

function tempDbPath(): string {
  return path.join(
    mkdtempSync(path.join(tmpdir(), "fuda-integrity-")),
    "fuda.db",
  );
}

describe("validateFudaSchemaIntegrity", () => {
  it("passes on an empty migrated database", () => {
    const { db } = openFudaDatabase(tempDbPath());
    assert.doesNotThrow(() => validateFudaSchemaIntegrity(db));
  });

  it("fails fast on grants referencing missing agents", () => {
    const { db } = openFudaDatabase(tempDbPath());
    db.exec("PRAGMA foreign_keys = OFF");
    db.prepare(
      `INSERT INTO bearers (bearer_id, display_name) VALUES (?, ?)`,
    ).run("bearer-1", "CI");
    db.prepare(
      `INSERT INTO bearer_agent_grants (bearer_id, agent_id) VALUES (?, ?)`,
    ).run("bearer-1", "missing-agent");
    db.exec("PRAGMA foreign_keys = ON");

    assert.throws(
      () => validateFudaSchemaIntegrity(db),
      (error: unknown) => {
        assert.ok(error instanceof SchemaIntegrityError);
        assert.match(error.errors.join("\n"), /missing agent/);
        return true;
      },
    );
  });

  it("fails fast on duplicate slugs", () => {
    const { db } = openFudaDatabase(tempDbPath());
    const now = new Date().toISOString();

    // Rebuild agents without the UNIQUE constraint to simulate corruption.
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("ALTER TABLE agents RENAME TO agents_old");
    db.exec(`
      CREATE TABLE agents (
        id TEXT NOT NULL PRIMARY KEY,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        groups_json TEXT NOT NULL,
        current_persona_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`
      INSERT INTO agents
      SELECT id, slug, name, owner_id, groups_json,
             current_persona_version, created_at, updated_at
      FROM agents_old
    `);
    db.exec("DROP TABLE agents_old");
    db.exec("PRAGMA foreign_keys = ON");

    db.prepare(
      `
      INSERT INTO agents (
        id, slug, name, owner_id, groups_json,
        current_persona_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run("a1", "dup", "One", "owner", "[]", 1, now, now);
    db.prepare(
      `
      INSERT INTO agents (
        id, slug, name, owner_id, groups_json,
        current_persona_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run("a2", "dup", "Two", "owner", "[]", 1, now, now);

    assert.throws(
      () => validateFudaSchemaIntegrity(db),
      (error: unknown) => {
        assert.ok(error instanceof SchemaIntegrityError);
        assert.match(error.errors.join("\n"), /Duplicate agent slug/);
        return true;
      },
    );
  });

  it("openFudaDatabase runs integrity checks after migrations", () => {
    const dbPath = tempDbPath();
    const { db } = openFudaDatabase(dbPath);
    db.exec("PRAGMA foreign_keys = OFF");
    db.prepare(
      `INSERT INTO bearers (bearer_id, display_name) VALUES (?, ?)`,
    ).run("bearer-1", "CI");
    db.prepare(
      `INSERT INTO bearer_agent_grants (bearer_id, agent_id) VALUES (?, ?)`,
    ).run("bearer-1", "ghost");
    db.close();

    assert.throws(
      () => openFudaDatabase(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof SchemaIntegrityError);
        assert.match(error.errors.join("\n"), /missing agent/);
        return true;
      },
    );
  });
});
