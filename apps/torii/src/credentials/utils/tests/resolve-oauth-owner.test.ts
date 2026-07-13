import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { resolveOAuthOwnerId } from "../resolve-oauth-owner.js";

const agent = {
  subject: {
    kind: "k8s_service_account" as const,
    namespace: "torii-agents",
    service_account: "demo-agent",
  },
  agent_id: "demo-agent-01",
  owner_id: "demo-owner",
  groups: ["agents"],
};

const baseConfig: ToriiConfig = {
  oauth_providers: {},
  servers: [],
};

describe("resolveOAuthOwnerId", () => {
  it("returns an explicit owner when provided", () => {
    assert.equal(
      resolveOAuthOwnerId(
        { ...baseConfig, agents: [agent, { ...agent, owner_id: "other" }] },
        "explicit-owner",
      ),
      "explicit-owner",
    );
  });

  it("returns the sole agent owner when one agent is configured", () => {
    assert.equal(
      resolveOAuthOwnerId({ ...baseConfig, agents: [agent] }, undefined),
      "demo-owner",
    );
  });

  it("throws when no agents are configured and owner is omitted", () => {
    assert.throws(
      () => resolveOAuthOwnerId(baseConfig, undefined),
      /No agents configured/,
    );
  });

  it("throws when multiple agents are configured and owner is omitted", () => {
    assert.throws(
      () =>
        resolveOAuthOwnerId(
          {
            ...baseConfig,
            agents: [agent, { ...agent, owner_id: "other-owner" }],
          },
          undefined,
        ),
      /Multiple agents configured/,
    );
  });
});
