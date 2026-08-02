import path from "node:path";
import { SqliteAgentRepository } from "../agents/sqlite-agent-repository.js";
import { SqliteBearerRepository } from "../bearers/sqlite-bearer-repository.js";
import { ConfigValidationError } from "../config/runtime-config.js";
import { resolveFudaDbPath } from "../storage/fuda-db-path.js";
import { openFudaDatabase } from "../storage/fuda-sqlite.js";
import { seedFudaDatabase } from "./seed-fuda-database.js";
import { loadSeedFile } from "./utils/parse-seed-file.js";

export async function runSeedCommand(args: readonly string[]): Promise<void> {
  const fileArg = args[0];
  if (!fileArg || args.length !== 1) {
    throw new ConfigValidationError([
      "Usage: fuda seed <file.yaml>",
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
