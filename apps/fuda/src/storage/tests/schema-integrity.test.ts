import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { openFudaDatabase } from "../fuda-postgres.js";
import {
  SchemaIntegrityError,
  validateFudaSchemaIntegrity,
} from "../validate-schema-integrity.js";

describe("validateFudaSchemaIntegrity", () => {
  it("passes on an empty migrated database", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      await validateFudaSchemaIntegrity(isolated.pool);
    } finally {
      await isolated.close();
    }
  });

  it("fails fast on grants referencing missing agents", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      await isolated.pool.query("SET session_replication_role = replica");
      await isolated.pool.query(
        `INSERT INTO bearers (bearer_id, display_name) VALUES ($1, $2)`,
        ["bearer-1", "CI"],
      );
      await isolated.pool.query(
        `INSERT INTO bearer_agent_grants (bearer_id, agent_id) VALUES ($1, $2)`,
        ["bearer-1", "missing-agent"],
      );
      await isolated.pool.query("SET session_replication_role = origin");

      await assert.rejects(
        () => validateFudaSchemaIntegrity(isolated.pool),
        (error: unknown) => {
          assert.ok(error instanceof SchemaIntegrityError);
          assert.match(error.errors.join("\n"), /missing agent/);
          return true;
        },
      );
    } finally {
      await isolated.close();
    }
  });

  it("fails fast on duplicate slugs", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      await isolated.pool.query(
        "ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_slug_key",
      );
      const now = new Date().toISOString();
      await isolated.pool.query(
        `
          INSERT INTO agents (
            id, slug, name, owner_id, groups_json,
            current_persona_version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        `,
        ["a1", "dup", "One", "owner", "[]", 1, now, now],
      );
      await isolated.pool.query(
        `
          INSERT INTO agents (
            id, slug, name, owner_id, groups_json,
            current_persona_version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        `,
        ["a2", "dup", "Two", "owner", "[]", 1, now, now],
      );

      await assert.rejects(
        () => validateFudaSchemaIntegrity(isolated.pool),
        (error: unknown) => {
          assert.ok(error instanceof SchemaIntegrityError);
          assert.match(error.errors.join("\n"), /Duplicate agent slug/);
          return true;
        },
      );
    } finally {
      await isolated.close();
    }
  });
});
