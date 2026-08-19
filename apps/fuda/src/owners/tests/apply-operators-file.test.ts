import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { PgAgentRepository } from "../../agents/pg-agent-repository.js";
import { openFudaDatabase } from "../../storage/fuda-postgres.js";
import { applyOperatorsFile } from "../apply-operators-file.js";
import { PgOwnerRepository } from "../pg-owner-repository.js";

describe("applyOperatorsFile", () => {
  it("returns null when FUDA_OPERATORS_PATH is unset", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const result = await applyOperatorsFile(
        new PgOwnerRepository(isolated.pool),
        new PgAgentRepository(isolated.pool),
        undefined,
      );
      assert.equal(result, null);
    } finally {
      await isolated.close();
    }
  });

  it("reconciles owners from the operators file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fuda-ops-"));
    const operatorsPath = path.join(dir, "operators.yaml");
    await writeFile(
      operatorsPath,
      `operators:\n  - owner_id: demo-owner\n    google_email: ops@example.com\n`,
      "utf8",
    );

    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const owners = new PgOwnerRepository(isolated.pool);
      const agents = new PgAgentRepository(isolated.pool);
      await owners.upsert("stale");

      const result = await applyOperatorsFile(owners, agents, operatorsPath);
      assert.ok(result);
      assert.equal(result.ownersDeleted, 1);
      assert.ok(await owners.get("demo-owner"));
      assert.equal(await owners.get("stale"), null);
    } finally {
      await isolated.close();
    }
  });
});
