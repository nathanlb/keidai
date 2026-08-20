import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { PgAgentRepository } from "../../agents/pg-agent-repository.js";
import { openFudaDatabase } from "../../storage/fuda-postgres.js";
import { ensurePlatformBearer } from "../ensure-platform-bearer.js";
import { PLATFORM_BEARER_ID } from "../platform-bearer.js";
import { PgBearerRepository } from "../pg-bearer-repository.js";

describe("ensurePlatformBearer", () => {
  it("creates the platform bearer and grants it to existing agents", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const agents = new PgAgentRepository(isolated.pool);
      const bearers = new PgBearerRepository(isolated.pool);
      const agent = await agents.create({
        slug: "newsletter",
        name: "Newsletter",
        ownerId: "owner-1",
        groups: [],
        persona: "Draft newsletters.",
      });

      const first = await ensurePlatformBearer(bearers, agents);
      assert.equal(first.bearerCreated, true);
      assert.equal(first.grantsEnsured, 1);
      const stored = await bearers.get(PLATFORM_BEARER_ID);
      assert.ok(stored);
      assert.equal(stored.displayName, PLATFORM_BEARER_ID);
      assert.equal(await bearers.hasGrant(PLATFORM_BEARER_ID, agent.id), true);

      await bearers.updateDisplayName(PLATFORM_BEARER_ID, "Shaiden");
      const second = await ensurePlatformBearer(bearers, agents);
      assert.equal(second.bearerCreated, false);
      assert.equal(second.grantsEnsured, 0);
      assert.equal(
        (await bearers.get(PLATFORM_BEARER_ID))?.displayName,
        "Shaiden",
      );
    } finally {
      await isolated.close();
    }
  });
});
