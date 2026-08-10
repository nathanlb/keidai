import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openFudaDatabase } from "../../storage/fuda-sqlite.js";
import { SqliteAgentRepository } from "../../agents/sqlite-agent-repository.js";
import { SqliteOwnerRepository } from "../sqlite-owner-repository.js";
import { reconcileOwners } from "../reconcile-owners.js";

describe("reconcileOwners", () => {
  it("upserts desired owners and deletes absent ones with cascade", () => {
    const { db } = openFudaDatabase(":memory:");
    try {
      const owners = new SqliteOwnerRepository(db);
      const agents = new SqliteAgentRepository(db);

      owners.upsert("keep");
      owners.upsert("drop");
      agents.create({
        slug: "a1",
        name: "A1",
        ownerId: "drop",
        groups: [],
        persona: "hi",
      });
      agents.create({
        slug: "a2",
        name: "A2",
        ownerId: "keep",
        groups: [],
        persona: "hi",
      });

      const result = reconcileOwners(owners, agents, ["keep", "new"]);

      assert.equal(result.ownersUpserted, 1);
      assert.equal(result.ownersDeleted, 1);
      assert.equal(result.agentsDeleted, 1);
      assert.ok(owners.get("keep"));
      assert.ok(owners.get("new"));
      assert.equal(owners.get("drop"), null);
      assert.equal(agents.getBySlug("a1"), null);
      assert.ok(agents.getBySlug("a2"));
    } finally {
      db.close();
    }
  });
});
