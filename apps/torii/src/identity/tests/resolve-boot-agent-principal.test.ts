import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import {
  resolveBootAgentPrincipal,
  STUB_AGENT_PRINCIPAL,
} from "../stub-agent-principal.js";

const baseConfig: ToriiConfig = {
  oauth_providers: {},
  servers: [
    {
      name: "linear",
      transport: { type: "http", url: "https://example.com/mcp" },
      credential: { strategy: "none" },
      policy: { default: "deny" },
    },
  ],
};

describe("resolveBootAgentPrincipal", () => {
  it("returns the stub principal when no agents are registered", () => {
    assert.deepEqual(resolveBootAgentPrincipal(baseConfig), STUB_AGENT_PRINCIPAL);
  });

  it("returns the first registered agent principal for OAuth token lookup", () => {
    const config: ToriiConfig = {
      ...baseConfig,
      agents: [
        {
          subject: {
            kind: "k8s_service_account",
            namespace: "torii-agents",
            service_account: "demo-agent",
          },
          agent_id: "demo-agent-01",
          owner_id: "demo-owner",
          groups: ["agents"],
        },
      ],
    };

    assert.deepEqual(resolveBootAgentPrincipal(config), {
      agentId: "demo-agent-01",
      ownerId: "demo-owner",
      groups: ["agents"],
    });
  });
});
