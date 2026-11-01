#!/usr/bin/env node
/**
 * Backfill `run_attempts` from run logs still inside step retention.
 * One-off: run after outcome rows are being written, once the log window
 * has the history you want counted. Safe to repeat.
 */
import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import { backfillRunAttempts } from "./runs/backfill-run-attempts.js";
import {
  openShaidenDatabase,
  resolveShaidenDatabaseUrl,
} from "./storage/shaiden-postgres.js";

async function main(): Promise<void> {
  const { pool } = await openShaidenDatabase(resolveShaidenDatabaseUrl());
  try {
    const result = await backfillRunAttempts(pool);
    console.log(
      JSON.stringify({
        service: "shaiden",
        backfill: "run_attempts",
        ...result,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
