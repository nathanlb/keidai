import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { PgAgentRepository } from "../../agents/pg-agent-repository.js";
import { openFudaDatabase } from "../../storage/fuda-postgres.js";
import { PgOwnerRepository } from "../pg-owner-repository.js";
import { reconcileOwners } from "../reconcile-owners.js";

describe("reconcileOwners", () => {
  it("upserts desired owners and deletes absent ones with cascade", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const owners = new PgOwnerRepository(isolated.pool);
      const agents = new PgAgentRepository(isolated.pool);

      await owners.upsert("keep");
      await owners.upsert("drop");
      await agents.create({
        slug: "a1",
        name: "A1",
        ownerId: "drop",
        groups: [],
        persona: "hi",
      });
      await agents.create({
        slug: "a2",
        name: "A2",
        ownerId: "keep",
        groups: [],
        persona: "hi",
      });

      const result = await reconcileOwners(owners, agents, ["keep", "new"]);
      assert.equal(result.ownersUpserted, 1);
      assert.equal(result.ownersDeleted, 1);
      assert.equal(result.agentsDeleted, 1);
      assert.ok(await owners.get("keep"));
      assert.ok(await owners.get("new"));
      assert.equal(await owners.get("drop"), null);
      assert.equal(await agents.getBySlug("a1"), null);
      assert.ok(await agents.getBySlug("a2"));
    } finally {
      await isolated.close();
    }
  });
});
