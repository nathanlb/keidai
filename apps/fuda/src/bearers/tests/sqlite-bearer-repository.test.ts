import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { SqliteAgentRepository } from "../../agents/sqlite-agent-repository.js";
import { openFudaDatabase } from "../../storage/fuda-sqlite.js";
import { SqliteBearerRepository } from "../sqlite-bearer-repository.js";

function createRepos() {
  const dbPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fuda-bearer-repo-")),
    "fuda.db",
  );
  const { db } = openFudaDatabase(dbPath);
  return {
    agents: new SqliteAgentRepository(db),
    bearers: new SqliteBearerRepository(db),
  };
}

describe("SqliteBearerRepository", () => {
  it("stores credential-agnostic bearers and grants", () => {
    const { agents, bearers } = createRepos();
    const agent = agents.create({
      slug: "newsletter",
      name: "Newsletter",
      ownerId: "owner-1",
      groups: [],
      persona: "Draft newsletters.",
    });

    const bearer = bearers.create({
      bearerId: "ci-runner",
      displayName: "CI runner",
    });
    assert.equal(bearer.displayName, "CI runner");

    const grant = bearers.grant(bearer.bearerId, agent.id);
    assert.deepEqual(grant, {
      bearerId: "ci-runner",
      agentId: agent.id,
    });
    assert.equal(bearers.hasGrant("ci-runner", agent.id), true);
    assert.deepEqual(bearers.listGrantsForAgent(agent.id), [grant]);
  });

  it("rejects grants for unknown agents when foreign keys are on", () => {
    const { bearers } = createRepos();
    bearers.create({ bearerId: "ci-runner", displayName: "CI" });
    assert.throws(
      () => bearers.grant("ci-runner", "missing-agent"),
      /FOREIGN KEY|constraint/i,
    );
  });

  it("deletes a bearer and its grants", () => {
    const { agents, bearers } = createRepos();
    const agent = agents.create({
      slug: "newsletter",
      name: "Newsletter",
      ownerId: "owner-1",
      groups: [],
      persona: "Draft newsletters.",
    });
    bearers.create({ bearerId: "ci-runner", displayName: "CI" });
    bearers.grant("ci-runner", agent.id);

    assert.equal(bearers.delete("ci-runner"), true);
    assert.equal(bearers.get("ci-runner"), null);
    assert.equal(bearers.hasGrant("ci-runner", agent.id), false);
  });
});
