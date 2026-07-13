import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OAuthProviderConfig } from "@keidai/shared";
import { buildOAuthLinkUrl, deriveAuthorizeUrl } from "../oauth-link-url.js";

const githubProvider: OAuthProviderConfig = {
  token_url: "https://github.com/login/oauth/access_token",
  client_id: "test-client-id",
  client_secret: "top-secret",
  scopes: ["repo", "read:user"],
};

const gatewayRedirect = "http://localhost:3100/oauth/callback/github";

describe("deriveAuthorizeUrl", () => {
  it("derives authorize URL from a standard token URL", () => {
    assert.equal(
      deriveAuthorizeUrl("https://github.com/login/oauth/access_token"),
      "https://github.com/login/oauth/authorize",
    );
  });
});

describe("buildOAuthLinkUrl", () => {
  it("builds an authorize URL with client_id, scopes, and redirect_uri", () => {
    const linkUrl = buildOAuthLinkUrl(githubProvider, "github", "owner-1", {
      redirectUri: gatewayRedirect,
    });
    const url = new URL(linkUrl);

    assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), "test-client-id");
    assert.equal(url.searchParams.get("scope"), "repo read:user");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(
      url.searchParams.get("redirect_uri"),
      gatewayRedirect,
    );
    assert.ok(url.searchParams.get("state"));

    const state = JSON.parse(
      Buffer.from(url.searchParams.get("state") ?? "", "base64url").toString(
        "utf8",
      ),
    );
    assert.deepEqual(state, { ownerId: "owner-1", provider: "github" });

    assert.doesNotMatch(linkUrl, /top-secret/);
    assert.doesNotMatch(linkUrl, /gho_/);
  });

  it("omits the scope parameter when no scopes are configured", () => {
    const linkUrl = buildOAuthLinkUrl(
      {
        authorize_url: "https://mcp.notion.com/authorize",
        token_url: "https://mcp.notion.com/token",
        client_id: "notion-client",
        scopes: [],
      },
      "notion",
      "owner-1",
      { redirectUri: "http://127.0.0.1:3100/oauth/callback/notion" },
    );
    const url = new URL(linkUrl);

    assert.equal(url.searchParams.has("scope"), false);
  });

  it("uses authorize_url and authorize_params when configured", () => {
    const linkUrl = buildOAuthLinkUrl(
      {
        authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
        token_url: "https://oauth2.googleapis.com/token",
        client_id: "google-client",
        client_secret: "secret",
        scopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.compose",
        ],
        authorize_params: {
          access_type: "offline",
          prompt: "consent",
        },
      },
      "google",
      "owner-1",
      {
        redirectUri: "http://127.0.0.1:3100/oauth/callback/google",
        codeChallenge: "challenge-123",
      },
    );
    const url = new URL(linkUrl);

    assert.equal(
      url.origin + url.pathname,
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.equal(url.searchParams.get("code_challenge"), "challenge-123");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  });
});
