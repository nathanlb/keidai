#!/usr/bin/env node
/**
 * Apply pending Shaiden schema migrations and exit.
 * Used by the Helm pre-upgrade / post-install migrate Job.
 */
import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import {
  migrateShaidenDatabase,
  resolveShaidenDatabaseUrl,
} from "./storage/shaiden-postgres.js";

async function main(): Promise<void> {
  const migrations = await migrateShaidenDatabase(resolveShaidenDatabaseUrl());
  console.log(
    JSON.stringify({
      service: "shaiden",
      applied: migrations.applied,
      alreadyApplied: migrations.alreadyApplied,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
