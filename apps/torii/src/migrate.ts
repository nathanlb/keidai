#!/usr/bin/env node
/**
 * Apply pending Torii schema migrations and exit.
 * Used by the Helm pre-upgrade / post-install migrate Job.
 */
import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import {
  migrateGatewayDatabase,
  resolveToriiDatabaseUrl,
} from "./storage/gateway-postgres.js";

async function main(): Promise<void> {
  const migrations = await migrateGatewayDatabase(resolveToriiDatabaseUrl());
  console.log(
    JSON.stringify({
      service: "torii",
      applied: migrations.applied,
      alreadyApplied: migrations.alreadyApplied,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
