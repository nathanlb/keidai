import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ConfigReadService } from "../config-read.service.js";
import { ToriiConfigService } from "../torii-config.service.js";

const sampleConfig: ToriiConfig = {
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
    const groups = service.listGroups();

    assert.equal(servers.servers.length, 1);
    assert.equal(servers.servers[0]?.name, "github");
    assert.deepEqual(servers.servers[0]?.policy, {
      default: "deny",
      allow: ["search_issues"],
    });
    assert.deepEqual(providers.providers.github?.scopes, ["repo"]);
    assert.deepEqual(groups, {
      groups: [{ name: "agents", description: "Test agents" }],
    });
    assert.equal(
      JSON.stringify({ servers, providers, groups }).includes("secret"),
      false,
    );
  });
});
