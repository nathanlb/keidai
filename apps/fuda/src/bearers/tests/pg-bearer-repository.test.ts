import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { PgAgentRepository } from "../../agents/pg-agent-repository.js";
import { openFudaDatabase } from "../../storage/fuda-postgres.js";
import { PgBearerRepository } from "../pg-bearer-repository.js";

async function createRepos() {
  const isolated = await createIsolatedSchema();
  await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
  return {
    agents: new PgAgentRepository(isolated.pool),
    bearers: new PgBearerRepository(isolated.pool),
    close: isolated.close,
  };
}

describe("PgBearerRepository", () => {
  it("stores credential-agnostic bearers and grants", async () => {
    const { agents, bearers, close } = await createRepos();
    try {
      const agent = await agents.create({
        slug: "newsletter",
        name: "Newsletter",
        ownerId: "owner-1",
        groups: [],
        persona: "Draft newsletters.",
      });
      const bearer = await bearers.create({
        bearerId: "ci-runner",
        displayName: "CI runner",
      });
      assert.equal(bearer.displayName, "CI runner");
      const grant = await bearers.grant(bearer.bearerId, agent.id);
      assert.deepEqual(grant, { bearerId: "ci-runner", agentId: agent.id });
      assert.equal(await bearers.hasGrant("ci-runner", agent.id), true);
      assert.deepEqual(await bearers.listGrantsForAgent(agent.id), [grant]);
    } finally {
      await close();
    }
  });

  it("rejects grants for unknown agents when foreign keys are on", async () => {
    const { bearers, close } = await createRepos();
    try {
      await bearers.create({ bearerId: "ci-runner", displayName: "CI" });
      await assert.rejects(
        () => bearers.grant("ci-runner", "missing-agent"),
        /foreign key|violates/i,
      );
    } finally {
      await close();
    }
  });

  it("deletes a bearer and its grants", async () => {
    const { agents, bearers, close } = await createRepos();
    try {
      const agent = await agents.create({
        slug: "newsletter",
        name: "Newsletter",
        ownerId: "owner-1",
        groups: [],
        persona: "Draft newsletters.",
      });
      await bearers.create({ bearerId: "ci-runner", displayName: "CI" });
      await bearers.grant("ci-runner", agent.id);
      assert.equal(await bearers.delete("ci-runner"), true);
      assert.equal(await bearers.get("ci-runner"), null);
      assert.equal(await bearers.hasGrant("ci-runner", agent.id), false);
    } finally {
      await close();
    }
  });
});
