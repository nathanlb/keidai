import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { SqliteAgentRepository } from "../../agents/sqlite-agent-repository.js";
import { SqliteBearerRepository } from "../../bearers/sqlite-bearer-repository.js";
import { ConfigValidationError } from "../../config/runtime-config.js";
import { openFudaDatabase } from "../../storage/fuda-sqlite.js";
import {
  seedFudaDatabase,
  type SeedRepositories,
} from "../seed-fuda-database.js";
import type { SeedFile } from "../types/seed-file.js";

function createRepos(): SeedRepositories {
  const dbPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fuda-seed-")),
    "fuda.db",
  );
  const { db } = openFudaDatabase(dbPath);
  return {
    agents: new SqliteAgentRepository(db),
    bearers: new SqliteBearerRepository(db),
  };
}

const sampleSeed: SeedFile = {
  agents: [
    {
      agent_id: "demo-agent-01",
      slug: "demo-agent",
      name: "Demo agent",
      owner_id: "demo-owner",
      groups: ["agents"],
      persona: "You are the demo agent.",
    },
  ],
  bearers: [{ bearer_id: "local-dev", display_name: "Local dev" }],
  grants: [{ bearer_id: "local-dev", agent_id: "demo-agent-01" }],
};

describe("seedFudaDatabase", () => {
  it("converges when run twice on a clean database", () => {
    const repos = createRepos();

    const first = seedFudaDatabase(repos, sampleSeed);
    assert.equal(first.agentsCreated, 1);
    assert.equal(first.bearersCreated, 1);
    assert.equal(first.grantsCreated, 1);
    assert.equal(first.personaVersionsAppended, 0);

    const second = seedFudaDatabase(repos, sampleSeed);
    assert.equal(second.agentsCreated, 0);
    assert.equal(second.agentsUnchanged, 1);
    assert.equal(second.bearersCreated, 0);
    assert.equal(second.bearersUnchanged, 1);
    assert.equal(second.grantsCreated, 0);
    assert.equal(second.grantsUnchanged, 1);
    assert.equal(second.personaVersionsAppended, 0);

    const agent = repos.agents.get("demo-agent-01");
    assert.equal(agent?.slug, "demo-agent");
    assert.equal(agent?.currentPersonaVersion, 1);
    assert.equal(repos.bearers.hasGrant("local-dev", "demo-agent-01"), true);
  });

  it("updates name/groups and appends persona when content changes", () => {
    const repos = createRepos();
    seedFudaDatabase(repos, sampleSeed);

    const updated: SeedFile = {
      ...sampleSeed,
      agents: [
        {
          ...sampleSeed.agents[0]!,
          name: "Demo agent v2",
          groups: ["agents", "ops"],
          persona: "You are the updated demo agent.",
        },
      ],
      bearers: [
        { bearer_id: "local-dev", display_name: "Local developer" },
      ],
    };

    const result = seedFudaDatabase(repos, updated);
    assert.equal(result.agentsUpdated, 1);
    assert.equal(result.personaVersionsAppended, 1);
    assert.equal(result.bearersUpdated, 1);

    const agent = repos.agents.get("demo-agent-01");
    assert.equal(agent?.name, "Demo agent v2");
    assert.deepEqual(agent?.groups, ["agents", "ops"]);
    assert.equal(agent?.currentPersonaVersion, 2);
    assert.equal(
      repos.agents.getCurrentPersona("demo-agent-01")?.content,
      "You are the updated demo agent.",
    );
    assert.equal(
      repos.agents.getPersonaVersion("demo-agent-01", 1)?.content,
      "You are the demo agent.",
    );
  });

  it("rejects slug mutation for an existing agent id", () => {
    const repos = createRepos();
    seedFudaDatabase(repos, sampleSeed);

    assert.throws(
      () =>
        seedFudaDatabase(repos, {
          ...sampleSeed,
          agents: [
            {
              ...sampleSeed.agents[0]!,
              slug: "renamed-slug",
            },
          ],
        }),
      (error: unknown) =>
        error instanceof ConfigValidationError &&
        error.errors.some((message) => message.includes("does not mutate slugs")),
    );

    assert.equal(repos.agents.get("demo-agent-01")?.slug, "demo-agent");
  });

  it("rejects owner_id mutation for an existing agent", () => {
    const repos = createRepos();
    seedFudaDatabase(repos, sampleSeed);

    assert.throws(
      () =>
        seedFudaDatabase(repos, {
          ...sampleSeed,
          agents: [
            {
              ...sampleSeed.agents[0]!,
              owner_id: "other-owner",
            },
          ],
        }),
      (error: unknown) =>
        error instanceof ConfigValidationError &&
        error.errors.some((message) => message.includes("owner is fixed")),
    );
  });

  it("rejects creating an agent when the slug already belongs to another id", () => {
    const repos = createRepos();
    seedFudaDatabase(repos, sampleSeed);

    assert.throws(
      () =>
        seedFudaDatabase(repos, {
          agents: [
            {
              agent_id: "other-agent",
              slug: "demo-agent",
              name: "Other",
              owner_id: "demo-owner",
              groups: [],
              persona: "persona",
            },
          ],
          bearers: [],
          grants: [],
        }),
      (error: unknown) =>
        error instanceof ConfigValidationError &&
        error.errors.some((message) =>
          message.includes('slug "demo-agent" already belongs'),
        ),
    );
  });

  it("does not delete grants absent from the seed file (one-way)", () => {
    const repos = createRepos();
    seedFudaDatabase(repos, sampleSeed);

    seedFudaDatabase(repos, {
      agents: sampleSeed.agents,
      bearers: sampleSeed.bearers,
      grants: [],
    });

    assert.equal(repos.bearers.hasGrant("local-dev", "demo-agent-01"), true);
  });
});
