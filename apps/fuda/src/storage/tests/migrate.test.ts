import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { runMigrations, type Migration } from "../migrate.js";

function openTempDb(): DatabaseSync {
  const dir = mkdtempSync(path.join(tmpdir(), "fuda-migrate-"));
  const db = new DatabaseSync(path.join(dir, "test.db"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("runMigrations", () => {
  it("applies pending migrations and records them", () => {
    const db = openTempDb();
    const migrations: Migration[] = [
      {
        id: "001_a",
        up(database) {
          database.exec("CREATE TABLE a (id TEXT PRIMARY KEY)");
        },
      },
      {
        id: "002_b",
        up(database) {
          database.exec("CREATE TABLE b (id TEXT PRIMARY KEY)");
        },
      },
    ];

    const first = runMigrations(db, migrations);
    assert.deepEqual(first.applied, ["001_a", "002_b"]);
    assert.deepEqual(first.alreadyApplied, []);

    const second = runMigrations(db, migrations);
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.alreadyApplied, ["001_a", "002_b"]);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      tables.map((row) => row.name).filter((name) => name === "a" || name === "b"),
      ["a", "b"],
    );
  });

  it("rolls back a failed migration and leaves prior ones applied", () => {
    const db = openTempDb();
    const migrations: Migration[] = [
      {
        id: "001_ok",
        up(database) {
          database.exec("CREATE TABLE ok (id TEXT PRIMARY KEY)");
        },
      },
      {
        id: "002_boom",
        up() {
          throw new Error("boom");
        },
      },
    ];

    assert.throws(() => runMigrations(db, migrations), /002_boom/);

    const applied = db
      .prepare("SELECT id FROM schema_migrations ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      applied.map((row) => row.id),
      ["001_ok"],
    );
  });

  it("rejects duplicate migration ids", () => {
    const db = openTempDb();
    assert.throws(
      () =>
        runMigrations(db, [
          { id: "001_x", up() {} },
          { id: "001_x", up() {} },
        ]),
      /Duplicate migration id/,
    );
  });
});
