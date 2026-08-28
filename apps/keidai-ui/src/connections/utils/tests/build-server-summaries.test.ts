import type {
  ConnectionStatus,
  PublicServerConfig,
} from "@keidai/shared";
import { describe, expect, it } from "vitest";
import {
  buildServerSummaries,
  summarizeConnectionCounts,
} from "../build-server-summaries.js";
import { formatCredentialSubStatus } from "../format-credential-substatus.js";

const githubServer: PublicServerConfig = {
  name: "github",
  transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
  credential: { strategy: "user_oauth", provider: "github" },
  policy: { default: "deny", allow: ["search_issues", "get_file_contents"] },
};

const linearServer: PublicServerConfig = {
  name: "linear",
  transport: { type: "http", url: "https://mcp.linear.app/mcp" },
  credential: {
    strategy: "service_key",
    inject: { header: "Authorization" },
  },
  policy: { default: "allow" },
};

describe("formatCredentialSubStatus", () => {
  it("never includes secret values for service_key", () => {
    expect(
      formatCredentialSubStatus({
        strategy: "service_key",
        inject: { header: "X-Api-Key" },
      }),
    ).toEqual({
      label: "header: X-Api-Key",
      warning: false,
    });
  });

  it("warns when oauth is not linked", () => {
    expect(
      formatCredentialSubStatus(
        { strategy: "user_oauth", provider: "github" },
        {
          oauthProviderConfig: {
            token_url: "https://github.com/login/oauth/access_token",
            client_id: "gh-client",
            scopes: ["repo"],
          },
        },
      ),
    ).toEqual({
      label: "not linked",
      warning: true,
    });
  });

  it("treats Class A DCR connectors without a static client_id as not linked", () => {
    expect(
      formatCredentialSubStatus(
        { strategy: "user_oauth", provider: "notion" },
        {
          oauthProviderConfig: {
            token_url: "https://mcp.notion.com/mcp",
            scopes: [],
          },
        },
      ),
    ).toEqual({
      label: "not linked",
      warning: true,
    });
  });

  it("shows the linked provider even when no static client_id is published", () => {
    expect(
      formatCredentialSubStatus(
        { strategy: "user_oauth", provider: "notion" },
        {
          oauthProviderConfig: {
            token_url: "https://mcp.notion.com/mcp",
            scopes: [],
          },
          oauthConnection: {
            provider: "notion",
            ownerId: "demo-owner",
            status: "linked",
            scopes: [],
          },
        },
      ),
    ).toEqual({
      label: "→ Notion",
      warning: false,
    });
  });
});

describe("buildServerSummaries", () => {
  it("merges config, live connection state, and oauth link status", () => {
    const connections = new Map<string, ConnectionStatus>([
      ["github", { name: "github", state: "connected", toolCount: 4 }],
      ["linear", { name: "linear", state: "failed", error: "connection refused" }],
    ]);

    const summaries = buildServerSummaries([githubServer, linearServer], connections, {
      ownerId: "demo-owner",
      oauthProviders: {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "gh-client",
          scopes: ["repo"],
        },
      },
      oauthConnections: [
        {
          provider: "github",
          ownerId: "demo-owner",
          status: "linked",
          scopes: ["repo"],
        },
      ],
    });

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      name: "github",
      toolCount: 4,
      rowAction: "none",
      credentialSubStatus: { label: "→ GitHub", warning: false },
    });
    expect(summaries[1]).toMatchObject({
      name: "linear",
      toolCount: null,
      rowAction: "none",
      error: "connection refused",
    });
  });

  it("offers Link for unlinked user_oauth servers", () => {
    const summaries = buildServerSummaries([githubServer], new Map(), {
      ownerId: "demo-owner",
      oauthProviders: {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "gh-client",
          scopes: ["repo"],
        },
      },
      oauthConnections: [],
    });

    expect(summaries[0]?.rowAction).toBe("link");
    expect(summaries[0]?.linkProviderId).toBe("github");
  });

  it("softens boot auth failures when the acting owner is already linked", () => {
    const connections = new Map<string, ConnectionStatus>([
      [
        "github",
        {
          name: "github",
          state: "failed",
          error:
            "Streamable HTTP error: Error POSTing to endpoint: bad request: missing required Authorization header",
        },
      ],
    ]);

    const summaries = buildServerSummaries([githubServer], connections, {
      ownerId: "demo-owner",
      oauthProviders: {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "gh-client",
          scopes: ["repo"],
        },
      },
      oauthConnections: [
        {
          provider: "github",
          ownerId: "demo-owner",
          status: "linked",
          scopes: ["repo"],
        },
      ],
    });

    expect(summaries[0]?.credentialSubStatus).toEqual({
      label: "→ GitHub",
      warning: false,
    });
    expect(summaries[0]?.error).toBe(
      "Owner linked — MCP connects on the next agent session",
    );
  });
});

describe("summarizeConnectionCounts", () => {
  it("computes tile counts from current summaries", () => {
    const counts = summarizeConnectionCounts([
      {
        name: "a",
        endpoint: "https://a",
        credentialStrategy: "none",
        credentialSubStatus: { label: "public · no auth", warning: false },
        toolCount: 1,
        state: "connected",
        rowAction: "none",
      },
      {
        name: "b",
        endpoint: "https://b",
        credentialStrategy: "none",
        credentialSubStatus: { label: "public · no auth", warning: false },
        toolCount: null,
        state: "connecting",
        rowAction: "none",
      },
      {
        name: "c",
        endpoint: "https://c",
        credentialStrategy: "none",
        credentialSubStatus: { label: "public · no auth", warning: false },
        toolCount: null,
        state: "failed",
        rowAction: "none",
      },
    ]);

    expect(counts).toEqual({
      total: 3,
      connected: 1,
      connecting: 1,
      failed: 1,
    });
  });
});
