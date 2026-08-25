#!/usr/bin/env node
/**
 * Apply pending Fuda schema migrations and exit.
 * Used by the Helm pre-upgrade / post-install migrate Job.
 */
import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import {
  migrateFudaDatabase,
  resolveFudaDatabaseUrl,
} from "./storage/fuda-postgres.js";
import { reportConfigError } from "./config/runtime-config.js";

async function main(): Promise<void> {
  const migrations = await migrateFudaDatabase(resolveFudaDatabaseUrl());
  console.log(
    JSON.stringify({
      service: "fuda",
      applied: migrations.applied,
      alreadyApplied: migrations.alreadyApplied,
    }),
  );
}

main().catch(reportConfigError);
