import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import {
  projectConfigAgents,
  projectConfigOAuthProviders,
  projectConfigServers,
  projectPublicCredential,
} from "../project-config-api.js";

const fullConfig: ToriiConfig = {
  oauth_providers: {
    github: {
      token_url: "https://github.com/login/oauth/access_token",
      client_id: "public-client-id",
      client_secret: "super-secret",
      scopes: ["repo"],
    },
  },
  servers: [
    {
      name: "linear",
      transport: { type: "http", url: "https://mcp.linear.app/mcp" },
      credential: {
        strategy: "service_key",
        key: "sk-secret",
        inject: { header: "Authorization" },
      },
      policy: { default: "deny" },
    },
    {
      name: "github",
      transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
      credential: { strategy: "user_oauth", provider: "github" },
      policy: { default: "deny" },
    },
    {
      name: "public",
      transport: { type: "http", url: "https://example.com/mcp" },
      credential: { strategy: "none" },
      policy: { default: "allow" },
    },
  ],
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
      inbound_token: "bearer-secret",
    },
  ],
};

describe("project-config-api", () => {
  it("projects servers with credential strategy only", () => {
    const result = projectConfigServers(fullConfig);

    assert.equal(result.servers.length, 3);
    assert.deepEqual(result.servers[0]!, {
      name: "linear",
      transport: { type: "http", url: "https://mcp.linear.app/mcp" },
      credential: { strategy: "service_key" },
    });
    assert.deepEqual(result.servers[1]!.credential, {
      strategy: "user_oauth",
      provider: "github",
    });
    assert.deepEqual(result.servers[2]!.credential, { strategy: "none" });
    assert.equal(
      JSON.stringify(result).includes("sk-secret"),
      false,
      "service key must not leak",
    );
  });

  it("projects oauth providers without client_secret", () => {
    const result = projectConfigOAuthProviders(fullConfig);

    assert.deepEqual(result.providers.github, {
      token_url: "https://github.com/login/oauth/access_token",
      client_id: "public-client-id",
      scopes: ["repo"],
    });
    assert.equal(
      "client_secret" in result.providers.github,
      false,
      "client_secret must not be present",
    );
    assert.equal(
      JSON.stringify(result).includes("super-secret"),
      false,
      "client secret value must not leak",
    );
  });

  it("projects agents without inbound_token", () => {
    const result = projectConfigAgents(fullConfig);

    assert.equal(result.agents.length, 1);
    assert.deepEqual(result.agents[0], {
      agent_id: "demo-agent-01",
      owner_id: "demo-owner",
      subject: {
        kind: "k8s_service_account",
        namespace: "torii-agents",
        service_account: "demo-agent",
      },
      groups: ["agents"],
    });
    assert.equal(
      JSON.stringify(result).includes("bearer-secret"),
      false,
      "inbound token must not leak",
    );
  });

  it("returns empty collections for empty config", () => {
    const empty: ToriiConfig = {
      oauth_providers: {},
      servers: [],
    };

    assert.deepEqual(projectConfigServers(empty), { servers: [] });
    assert.deepEqual(projectConfigOAuthProviders(empty), { providers: {} });
    assert.deepEqual(projectConfigAgents(empty), { agents: [] });
  });

  it("projects all credential strategies", () => {
    assert.deepEqual(
      projectPublicCredential({ strategy: "user_oauth", provider: "github" }),
      { strategy: "user_oauth", provider: "github" },
    );
    assert.deepEqual(
      projectPublicCredential({
        strategy: "service_key",
        key: "hidden",
      }),
      { strategy: "service_key" },
    );
    assert.deepEqual(projectPublicCredential({ strategy: "none" }), {
      strategy: "none",
    });
  });
});
