import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  isUniqueViolation,
  runMigrations,
  type Migration,
} from "../index.js";

describe("runMigrations", () => {
  it("applies pending migrations and records them", async () => {
    const isolated = await createIsolatedSchema();
    try {
      const migrations: Migration[] = [
        {
          id: "001_a",
          async up(queryable) {
            await queryable.query("CREATE TABLE a (id TEXT PRIMARY KEY)");
          },
        },
        {
          id: "002_b",
          async up(queryable) {
            await queryable.query("CREATE TABLE b (id TEXT PRIMARY KEY)");
          },
        },
      ];

      const first = await runMigrations(isolated.pool, migrations);
      assert.deepEqual(first.applied, ["001_a", "002_b"]);
      assert.deepEqual(first.alreadyApplied, []);

      const second = await runMigrations(isolated.pool, migrations);
      assert.deepEqual(second.applied, []);
      assert.deepEqual(second.alreadyApplied, ["001_a", "002_b"]);

      const tables = await isolated.pool.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = current_schema()
           AND tablename IN ('a', 'b')
         ORDER BY tablename`,
      );
      assert.deepEqual(
        tables.rows.map((row) => row.tablename),
        ["a", "b"],
      );
    } finally {
      await isolated.close();
    }
  });

  it("rolls back a failed migration and leaves prior ones applied", async () => {
    const isolated = await createIsolatedSchema();
    try {
      const migrations: Migration[] = [
        {
          id: "001_ok",
          async up(queryable) {
            await queryable.query("CREATE TABLE ok (id TEXT PRIMARY KEY)");
          },
        },
        {
          id: "002_boom",
          async up() {
            throw new Error("boom");
          },
        },
      ];

      await assert.rejects(
        () => runMigrations(isolated.pool, migrations),
        /002_boom/,
      );

      const applied = await isolated.pool.query<{ id: string }>(
        "SELECT id FROM schema_migrations ORDER BY id",
      );
      assert.deepEqual(
        applied.rows.map((row) => row.id),
        ["001_ok"],
      );
    } finally {
      await isolated.close();
    }
  });

  it("rejects duplicate migration ids", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await assert.rejects(
        () =>
          runMigrations(isolated.pool, [
            { id: "001_x", async up() {} },
            { id: "001_x", async up() {} },
          ]),
        /Duplicate migration id/,
      );
    } finally {
      await isolated.close();
    }
  });
});

describe("isUniqueViolation", () => {
  it("detects unique constraint failures", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await isolated.pool.query("CREATE TABLE items (id TEXT PRIMARY KEY)");
      await isolated.pool.query("INSERT INTO items (id) VALUES ('a')");
      await assert.rejects(async () => {
        try {
          await isolated.pool.query("INSERT INTO items (id) VALUES ('a')");
        } catch (error) {
          assert.equal(isUniqueViolation(error), true);
          throw error;
        }
      });
    } finally {
      await isolated.close();
    }
  });
});
