import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ConfigReadService } from "../config-read.service.js";
import { ToriiConfigService } from "../torii-config.service.js";

const sampleConfig: ToriiConfig = {
  boot_owner_id: "test-owner",
  oauth_providers: {
    github: {
      token_url: "https://github.com/login/oauth/access_token",
      client_secret: "secret",
      scopes: ["repo"],
    },
  },
  servers: [
    {
      name: "github",
      transport: { type: "http", url: "https://example.com/mcp" },
      credential: { strategy: "user_oauth", provider: "github" },
    },
  ],
  agents: [
    {
      subject: {
        kind: "k8s_service_account",
        namespace: "ns",
        service_account: "sa",
      },
      agent_id: "agent-1",
      owner_id: "owner-1",
      groups: [],
      inbound_token: "token",
    },
  ],
};

describe("ConfigReadService", () => {
  it("reads sanitized config projections from boot-loaded config", () => {
    const service = new ConfigReadService(
      new ToriiConfigService({
        ...sampleConfig,
        groups: [
          {
            name: "agents",
            description: "Test agents",
            permissions: [
              { server: "github", tools: ["search_issues"] },
            ],
          },
        ],
      }),
    );

    const servers = service.listServers();
    const providers = service.listOAuthProviders();
    const agents = service.listAgents();
    const groups = service.listGroups();

    assert.equal(servers.servers.length, 1);
    assert.equal(servers.servers[0]?.name, "github");
    assert.deepEqual(servers.servers[0]?.policy, {
      default: "deny",
      allow: ["search_issues"],
    });
    assert.deepEqual(providers.providers.github?.scopes, ["repo"]);
    assert.equal(agents.agents[0]?.owner_id, "owner-1");
    assert.deepEqual(groups, {
      groups: [{ name: "agents", description: "Test agents" }],
    });
    assert.equal(
      JSON.stringify({ servers, providers, agents, groups }).includes("secret"),
      false,
    );
  });
});
