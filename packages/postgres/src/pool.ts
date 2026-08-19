import pg from "pg";

const { Pool } = pg;

export type { Pool, PoolClient } from "pg";

export type Queryable = Pick<pg.Pool, "query">;

export function createPool(connectionString: string, options?: pg.PoolConfig): pg.Pool {
  return new Pool({
    connectionString,
    max: options?.max ?? 10,
    ...options,
  });
}

export function requireDatabaseUrl(
  envVar: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[envVar]?.trim();
  if (!value) {
    throw new Error(`${envVar} is required`);
  }
  return value;
}

export function resolveTestDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env.KEIDAI_TEST_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "KEIDAI_TEST_DATABASE_URL is not set. Database tests call ensureTestDatabaseUrl() automatically.",
    );
  }
  return value;
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
