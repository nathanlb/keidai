/**
 * Cluster/local seed entrypoint compiled into the Fuda image.
 *
 *   node dist/seed/cli.js /app/seed/fuda.seed.k8s.yaml
 */
import path from "node:path";
import { SqliteAgentRepository } from "../agents/sqlite-agent-repository.js";
import { SqliteBearerRepository } from "../bearers/sqlite-bearer-repository.js";
import {
  ConfigValidationError,
  reportConfigError,
} from "../config/runtime-config.js";
import { seedFudaDatabase } from "./seed-fuda-database.js";
import { loadSeedFile } from "./utils/parse-seed-file.js";
import { resolveFudaDbPath } from "../storage/fuda-db-path.js";
import { openFudaDatabase } from "../storage/fuda-sqlite.js";

async function main(): Promise<void> {
  const fileArg = process.argv[2];
  if (!fileArg || process.argv.length !== 3) {
    throw new ConfigValidationError([
      "Usage: node dist/seed/cli.js <file.yaml>",
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
