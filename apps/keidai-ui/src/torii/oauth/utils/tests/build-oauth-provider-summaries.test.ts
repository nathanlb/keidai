import type { PublicOAuthProviderConfig } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import { buildOAuthProviderSummaries } from "../build-oauth-provider-summaries.js";
import {
  formatClientIdDisplay,
  formatClientSecretLabel,
  isProviderMisconfigured,
} from "../oauth-provider-config.js";

const githubConfig: PublicOAuthProviderConfig = {
  token_url: "https://github.com/login/oauth/access_token",
  authorize_url: "https://github.com/login/oauth/authorize",
  client_id: "Iv1.8a61f9publicclient",
  scopes: ["repo", "read:user"],
  redirect_uri: "http://127.0.0.1:8765/callback",
  pkce: true,
};

describe("isProviderMisconfigured", () => {
  it("flags static providers missing client_id", () => {
    expect(
      isProviderMisconfigured({
        token_url: "https://example.com/token",
        scopes: [],
      }),
    ).toBe(true);
  });

  it("accepts dynamic registration providers with registration_endpoint", () => {
    expect(
      isProviderMisconfigured({
        token_url: "https://example.com/token",
        registration_endpoint: "https://example.com/register",
        redirect_uri: "http://127.0.0.1:8765/callback",
        scopes: ["read"],
      }),
    ).toBe(false);
  });
});

describe("formatClientIdDisplay", () => {
  it("labels dynamic registration providers", () => {
    expect(
      formatClientIdDisplay({
        token_url: "https://example.com/token",
        registration_endpoint: "https://example.com/register",
        scopes: [],
      }),
    ).toBe("dynamic (RFC 7591)");
  });
});

describe("formatClientSecretLabel", () => {
  it("never exposes secret values", () => {
    expect(formatClientSecretLabel(githubConfig)).toEqual({
      label: "configured (hidden)",
      missing: false,
    });
  });
});

describe("buildOAuthProviderSummaries", () => {
  it("aggregates linked and expired owners per provider", () => {
    const summaries = buildOAuthProviderSummaries(
      {
        github: githubConfig,
        google: {
          token_url: "https://oauth2.googleapis.com/token",
          client_id: "4079.apps.googleusercontent.com",
          scopes: ["calendar.readonly"],
          redirect_uri: "http://127.0.0.1:8765/callback",
        },
      },
      ["owner-a", "owner-b"],
      new Map([
        [
          "owner-a",
          [
            {
              provider: "github",
              ownerId: "owner-a",
              status: "linked",
              scopes: ["repo"],
            },
            {
              provider: "google",
              ownerId: "owner-a",
              status: "expired",
              scopes: ["calendar.readonly"],
            },
          ],
        ],
        [
          "owner-b",
          [
            {
              provider: "github",
              ownerId: "owner-b",
              status: "not_linked",
              scopes: ["repo"],
            },
          ],
        ],
      ]),
    );

    expect(summaries).toHaveLength(2);

    const github = summaries.find((summary) => summary.id === "github");
    expect(github?.aggregateStatus).toBe("linked");
    expect(github?.owners).toHaveLength(1);
    expect(github?.owners[0]?.ownerId).toBe("owner-a");

    const google = summaries.find((summary) => summary.id === "google");
    expect(google?.aggregateStatus).toBe("expired");
    expect(google?.owners[0]?.healthLabel).toContain("re-link");
  });

  it("returns an empty list when no providers are configured", () => {
    expect(buildOAuthProviderSummaries({}, [], new Map())).toEqual([]);
  });
});
