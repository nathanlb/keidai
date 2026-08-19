import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { openFudaDatabase } from "../fuda-postgres.js";

describe("001_baseline schema", () => {
  it("creates owners, agents, personas, bearers, and grants", async () => {
    const isolated = await createIsolatedSchema();
    try {
      const { migrations } = await openFudaDatabase(
        resolveTestDatabaseUrl(),
        isolated.pool,
      );
      assert.deepEqual(migrations.applied, ["001_baseline"]);

      const tables = await isolated.pool.query<{ tablename: string }>(
        `
          SELECT tablename FROM pg_tables
          WHERE schemaname = current_schema()
          ORDER BY tablename
        `,
      );
      const names = tables.rows.map((row) => row.tablename);
      assert.ok(names.includes("agents"));
      assert.ok(names.includes("persona_versions"));
      assert.ok(names.includes("bearers"));
      assert.ok(names.includes("bearer_agent_grants"));
      assert.ok(names.includes("owners"));
    } finally {
      await isolated.close();
    }
  });

  it("enforces slug uniqueness at the database level", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const now = new Date().toISOString();
      await isolated.pool.query(
        `
          INSERT INTO agents (
            id, slug, name, owner_id, groups_json,
            current_persona_version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        `,
        ["a1", "newsletter", "One", "owner", "[]", 1, now, now],
      );
      await assert.rejects(
        () =>
          isolated.pool.query(
            `
              INSERT INTO agents (
                id, slug, name, owner_id, groups_json,
                current_persona_version, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
            `,
            ["a2", "newsletter", "Two", "owner", "[]", 1, now, now],
          ),
        /unique|duplicate/i,
      );
    } finally {
      await isolated.close();
    }
  });

  it("is idempotent when re-applied via openFudaDatabase", async () => {
    const isolated = await createIsolatedSchema();
    try {
      const first = await openFudaDatabase(
        resolveTestDatabaseUrl(),
        isolated.pool,
      );
      assert.deepEqual(first.migrations.applied, ["001_baseline"]);
      const second = await openFudaDatabase(
        resolveTestDatabaseUrl(),
        isolated.pool,
      );
      assert.deepEqual(second.migrations.applied, []);
      assert.deepEqual(second.migrations.alreadyApplied, ["001_baseline"]);
    } finally {
      await isolated.close();
    }
  });
});
