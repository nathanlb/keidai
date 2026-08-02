#!/usr/bin/env tsx
/**
 * Dev/demo setup utility (NAT-121). Not part of the production `fuda` server bin.
 *
 *   pnpm --filter @keidai/fuda seed -- ./fuda.seed.example.yaml
 */
import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import path from "node:path";
import { SqliteAgentRepository } from "../src/agents/sqlite-agent-repository.js";
import { SqliteBearerRepository } from "../src/bearers/sqlite-bearer-repository.js";
import {
  ConfigValidationError,
  reportConfigError,
} from "../src/config/runtime-config.js";
import { seedFudaDatabase } from "../src/seed/seed-fuda-database.js";
import { loadSeedFile } from "../src/seed/utils/parse-seed-file.js";
import { resolveFudaDbPath } from "../src/storage/fuda-db-path.js";
import { openFudaDatabase } from "../src/storage/fuda-sqlite.js";

async function main(): Promise<void> {
  const fileArg = process.argv[2];
  if (!fileArg || process.argv.length !== 3) {
    throw new ConfigValidationError([
      "Usage: pnpm --filter @keidai/fuda seed -- <file.yaml>",
    ]);
  }

  const filePath = path.resolve(fileArg);
  const seed = await loadSeedFile(filePath);
  const dbPath = resolveFudaDbPath();
  const { db, migrations } = openFudaDatabase(dbPath);

  try {
    const result = seedFudaDatabase(
      {
        agents: new SqliteAgentRepository(db),
        bearers: new SqliteBearerRepository(db),
      },
      seed,
    );

    console.log(
      JSON.stringify(
        {
          file: filePath,
          dbPath,
          migrations: {
            applied: migrations.applied,
            alreadyApplied: migrations.alreadyApplied,
          },
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
}

main().catch(reportConfigError);
