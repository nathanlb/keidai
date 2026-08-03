import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { resolveBootPrincipal } from "../resolve-boot-principal.js";

const baseConfig: ToriiConfig = {
  boot_owner_id: "ops-owner",
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

describe("resolveBootPrincipal", () => {
  it("builds a principal from boot_owner_id without reading agents", () => {
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

    assert.deepEqual(resolveBootPrincipal(config), {
      agentId: "boot",
      ownerId: "ops-owner",
      groups: [],
      bearerId: "boot",
    });
  });

  it("works when no agents are registered", () => {
    assert.deepEqual(resolveBootPrincipal(baseConfig), {
      agentId: "boot",
      ownerId: "ops-owner",
      groups: [],
      bearerId: "boot",
    });
  });
});
