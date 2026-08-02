import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigValidationError } from "../../config/runtime-config.js";
import { parseSeedDocument } from "../utils/parse-seed-file.js";

describe("parseSeedDocument", () => {
  it("parses agents, bearers, and grants", () => {
    const seed = parseSeedDocument({
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
    });

    assert.equal(seed.agents.length, 1);
    assert.equal(seed.agents[0]?.slug, "demo-agent");
    assert.equal(seed.bearers[0]?.display_name, "Local dev");
    assert.equal(seed.grants[0]?.agent_id, "demo-agent-01");
  });

  it("strips Torii credential fields so missing env refs do not fail", () => {
    const seed = parseSeedDocument(
      {
        agents: [
          {
            agent_id: "demo-agent-01",
            slug: "demo-agent",
            name: "Demo agent",
            owner_id: "demo-owner",
            groups: ["agents"],
            persona: "You are the demo agent.",
            subject: {
              kind: "k8s_service_account",
              namespace: "torii-agents",
              service_account: "demo-agent",
            },
            inbound_token: "${env:DEMO_AGENT_BEARER}",
            gated_tools: ["gmail.create_draft"],
          },
        ],
      },
      {},
    );

    assert.equal(seed.agents.length, 1);
    assert.equal(
      "inbound_token" in (seed.agents[0] as object),
      false,
    );
  });

  it("resolves env refs in persisted fields", () => {
    const seed = parseSeedDocument(
      {
        agents: [
          {
            agent_id: "demo-agent-01",
            slug: "demo-agent",
            name: "${env:AGENT_NAME}",
            owner_id: "demo-owner",
            groups: [],
            persona: "persona",
          },
        ],
      },
      { AGENT_NAME: "Resolved name" },
    );

    assert.equal(seed.agents[0]?.name, "Resolved name");
  });

  it("rejects missing required agent fields", () => {
    assert.throws(
      () =>
        parseSeedDocument({
          agents: [
            {
              agent_id: "demo-agent-01",
              slug: "demo-agent",
              name: "Demo",
              owner_id: "owner",
              groups: [],
            },
          ],
        }),
      (error: unknown) =>
        error instanceof ConfigValidationError &&
        error.errors.some((message) => message.includes("persona")),
    );
  });

  it("defaults missing top-level lists to empty arrays", () => {
    const seed = parseSeedDocument({});
    assert.deepEqual(seed, { agents: [], bearers: [], grants: [] });
  });
});
