import { randomUUID } from "node:crypto";
import pg from "pg";
import { quoteIdent } from "./ident.js";
import { createPool, type Pool } from "./pool.js";
import { ensureTestDatabaseUrl } from "./test-database.js";

const { Pool: PgPool } = pg;

export interface IsolatedSchema {
  pool: Pool;
  schema: string;
  close: () => Promise<void>;
}

/**
 * Creates a unique schema and a pool whose `search_path` is pinned to it.
 * Used so parallel tests do not share tables.
 *
 * When `connectionString` is omitted, {@link ensureTestDatabaseUrl} probes
 * `KEIDAI_TEST_DATABASE_URL` and otherwise starts a throwaway Docker Postgres.
 */
export async function createIsolatedSchema(
  connectionString?: string,
): Promise<IsolatedSchema> {
  const url = connectionString ?? (await ensureTestDatabaseUrl());
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PgPool({ connectionString: url, max: 1 });
  try {
    await admin.query(`CREATE SCHEMA ${quoteIdent(schema)}`);
  } finally {
    await admin.end();
  }

  const pool = createPool(url, {
    max: 8,
    options: `-c search_path=${schema}`,
  });

  return {
    pool,
    schema,
    close: async () => {
      await pool.end();
      const drop = new PgPool({ connectionString: url, max: 1 });
      try {
        await drop.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
      } finally {
        await drop.end();
      }
    },
  };
}
