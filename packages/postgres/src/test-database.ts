import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);

export const TEST_POSTGRES_CONTAINER = "keidai-test-postgres";
export const TEST_POSTGRES_PORT = 54329;
export const TEST_POSTGRES_IMAGE = "postgres:16-alpine";

const SIDECAR_USER = "postgres";
const SIDECAR_PASSWORD = "postgres";
const SIDECAR_DB = "postgres";

function sidecarUrl(): string {
  return `postgres://${SIDECAR_USER}:${SIDECAR_PASSWORD}@127.0.0.1:${TEST_POSTGRES_PORT}/${SIDECAR_DB}`;
}

function composeDefaultUrl(env: NodeJS.ProcessEnv): string {
  const password = env.POSTGRES_PASSWORD?.trim() || "keidai-local";
  return `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:5432/postgres`;
}

async function canConnect(connectionString: string): Promise<boolean> {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 1500,
  });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function docker(args: readonly string[]): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
}> {
  try {
    const result = await execFileAsync("docker", args, { encoding: "utf8" });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    if (err.code === "ENOENT") {
      throw new Error(
        "Database tests need Docker (to start a throwaway Postgres) or KEIDAI_TEST_DATABASE_URL pointing at a reachable server.",
      );
    }
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    };
  }
}

async function waitUntilReady(
  connectionString: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnect(connectionString)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Test Postgres did not accept connections at ${connectionString.replace(/:[^:@]+@/, ":***@")}`,
  );
}

async function ensureSidecar(): Promise<string> {
  const url = sidecarUrl();
  if (await canConnect(url)) {
    return url;
  }

  const inspect = await docker([
    "inspect",
    "-f",
    "{{.State.Running}}",
    TEST_POSTGRES_CONTAINER,
  ]);
  if (inspect.ok && inspect.stdout.trim() === "true") {
    await waitUntilReady(url, 30_000);
    return url;
  }
  if (inspect.ok) {
    const started = await docker(["start", TEST_POSTGRES_CONTAINER]);
    if (started.ok) {
      await waitUntilReady(url, 30_000);
      return url;
    }
  }

  const run = await docker([
    "run",
    "-d",
    "--name",
    TEST_POSTGRES_CONTAINER,
    "-e",
    `POSTGRES_USER=${SIDECAR_USER}`,
    "-e",
    `POSTGRES_PASSWORD=${SIDECAR_PASSWORD}`,
    "-e",
    `POSTGRES_DB=${SIDECAR_DB}`,
    "-p",
    `${TEST_POSTGRES_PORT}:5432`,
    TEST_POSTGRES_IMAGE,
  ]);
  if (!run.ok) {
    const conflict =
      run.stderr.includes("is already in use") ||
      run.stderr.includes("Conflict");
    if (conflict) {
      await docker(["start", TEST_POSTGRES_CONTAINER]);
      await waitUntilReady(url, 60_000);
      return url;
    }
    throw new Error(
      `Failed to start ${TEST_POSTGRES_CONTAINER}: ${run.stderr.trim() || run.stdout.trim()}`,
    );
  }

  await waitUntilReady(url, 60_000);
  return url;
}

/**
 * Returns a Postgres URL tests can use.
 *
 * Prefers `KEIDAI_TEST_DATABASE_URL` when it actually accepts connections.
 * Otherwise starts (or reuses) a Docker sidecar on port 54329 so local tests
 * do not depend on the password of whatever is bound to :5432.
 */
export async function ensureTestDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const candidates = [
    env.KEIDAI_TEST_DATABASE_URL?.trim(),
    composeDefaultUrl(env),
  ].filter((value, index, all): value is string => {
    return Boolean(value) && all.indexOf(value) === index;
  });

  for (const url of candidates) {
    if (await canConnect(url)) {
      env.KEIDAI_TEST_DATABASE_URL = url;
      return url;
    }
  }

  const url = await ensureSidecar();
  env.KEIDAI_TEST_DATABASE_URL = url;
  return url;
}
