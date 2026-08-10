import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { SqliteAgentRepository } from "../../agents/sqlite-agent-repository.js";
import { openFudaDatabase } from "../../storage/fuda-sqlite.js";
import { applyOperatorsFile } from "../apply-operators-file.js";
import { SqliteOwnerRepository } from "../sqlite-owner-repository.js";

describe("applyOperatorsFile", () => {
  it("returns null when FUDA_OPERATORS_PATH is unset", async () => {
    const { db } = openFudaDatabase(":memory:");
    try {
      const result = await applyOperatorsFile(
        new SqliteOwnerRepository(db),
        new SqliteAgentRepository(db),
        undefined,
      );
      assert.equal(result, null);
    } finally {
      db.close();
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

    const { db } = openFudaDatabase(":memory:");
    try {
      const owners = new SqliteOwnerRepository(db);
      const agents = new SqliteAgentRepository(db);
      owners.upsert("stale");

      const result = await applyOperatorsFile(owners, agents, operatorsPath);
      assert.ok(result);
      assert.equal(result.ownersDeleted, 1);
      assert.ok(owners.get("demo-owner"));
      assert.equal(owners.get("stale"), null);
    } finally {
      db.close();
    }
  });
});
