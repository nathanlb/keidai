import type {
  ConnectionStatus,
  PublicServerConfig,
} from "@keidai/shared";
import { describe, expect, it } from "vitest";
import {
  buildServerSummaries,
  summarizeConnectionCounts,
} from "../build-server-summaries.js";
import { formatPolicySummary } from "../format-policy-summary.js";
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

describe("formatPolicySummary", () => {
  it("formats deny-default policies with allow-list size", () => {
    expect(formatPolicySummary({ default: "deny", allow: ["a", "b"] })).toBe(
      "deny · 2 allowed",
    );
  });

  it("formats allow-default policies", () => {
    expect(formatPolicySummary({ default: "allow" })).toBe("allow");
  });
});

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
      policySummary: "deny · 2 allowed",
      toolCount: 4,
      rowAction: "none",
      credentialSubStatus: { label: "→ GitHub", warning: false },
    });
    expect(summaries[1]).toMatchObject({
      name: "linear",
      policySummary: "allow",
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
});

describe("summarizeConnectionCounts", () => {
  it("computes tile counts from current summaries", () => {
    const counts = summarizeConnectionCounts([
      {
        name: "a",
        endpoint: "https://a",
        credentialStrategy: "none",
        credentialSubStatus: { label: "public · no auth", warning: false },
        policySummary: "allow",
        toolCount: 1,
        state: "connected",
        rowAction: "none",
      },
      {
        name: "b",
        endpoint: "https://b",
        credentialStrategy: "none",
        credentialSubStatus: { label: "public · no auth", warning: false },
        policySummary: "allow",
        toolCount: null,
        state: "connecting",
        rowAction: "none",
      },
      {
        name: "c",
        endpoint: "https://c",
        credentialStrategy: "none",
        credentialSubStatus: { label: "public · no auth", warning: false },
        policySummary: "allow",
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
