import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import {
  projectConfigGroups,
  projectConfigOAuthProviders,
  projectConfigServers,
  projectPublicCredential,
  projectPublicServer,
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
    },
    {
      name: "github",
      transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
      credential: { strategy: "user_oauth", provider: "github" },
    },
    {
      name: "public",
      transport: { type: "http", url: "https://example.com/mcp" },
      credential: { strategy: "none" },
    },
  ],
  groups: [
    {
      name: "agents",
      description: "Full access agents group",
      permissions: [
        { server: "linear", tools: ["list_issues", "get_issue"] },
      ],
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
      credential: {
        strategy: "service_key",
        inject: { header: "Authorization" },
      },
      policy: { default: "deny", allow: [] },
    });
    assert.deepEqual(result.servers[1]!.credential, {
      strategy: "user_oauth",
      provider: "github",
    });
    assert.deepEqual(result.servers[1]!.policy, { default: "deny", allow: [] });
    assert.deepEqual(result.servers[2]!.credential, { strategy: "none" });
    assert.deepEqual(result.servers[2]!.policy, { default: "deny", allow: [] });
    assert.equal(
      JSON.stringify(result).includes("sk-secret"),
      false,
      "service key must not leak",
    );
  });

  it("derives a server allow-list from persisted group policy", () => {
    const projected = projectPublicServer(fullConfig.servers[0]!, [
      {
        name: "agents",
        servers: [
          {
            server: "linear",
            default: "deny",
            allow: ["get_issue", "list_issues"],
            deny: [],
            gated: [],
          },
        ],
      },
    ]);

    assert.deepEqual(projected.policy, {
      default: "deny",
      allow: ["get_issue", "list_issues"],
    });
  });

  it("projects default allow, deny, and gated lists from group policy", () => {
    const projected = projectPublicServer(fullConfig.servers[0]!, [
      {
        name: "readers",
        servers: [
          {
            server: "linear",
            default: "allow",
            allow: [],
            deny: ["delete_issue"],
            gated: ["create_issue"],
          },
        ],
      },
      {
        name: "writers",
        servers: [
          {
            server: "linear",
            default: "deny",
            allow: ["list_issues"],
            deny: [],
            gated: [],
          },
        ],
      },
    ]);

    assert.deepEqual(projected.policy, {
      default: "allow",
      allow: ["list_issues"],
      deny: ["delete_issue"],
      gated: ["create_issue"],
    });
  });

  it("projects group definitions without exposing permissions", () => {
    const result = projectConfigGroups(fullConfig);

    assert.deepEqual(result.groups, [
      { name: "agents", description: "Full access agents group" },
    ]);
    assert.equal(
      JSON.stringify(result).includes("list_issues"),
      false,
      "permissions must not leak in the group projection",
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

  it("returns empty collections for empty config", () => {
    const empty: ToriiConfig = {
      oauth_providers: {},
      servers: [],
    };

    assert.deepEqual(projectConfigServers(empty), { servers: [] });
    assert.deepEqual(projectConfigOAuthProviders(empty), { providers: {} });
    assert.deepEqual(projectConfigGroups(empty), { groups: [] });
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
    assert.deepEqual(
      projectPublicCredential({
        strategy: "service_key",
        key: "hidden",
        inject: { header: "X-Api-Key" },
      }),
      { strategy: "service_key", inject: { header: "X-Api-Key" } },
    );
    assert.deepEqual(projectPublicCredential({ strategy: "none" }), {
      strategy: "none",
    });
  });
});
