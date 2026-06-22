import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OAuthProviderConfig } from "@keidai/shared";
import { buildOAuthTokenRequest } from "../oauth-token-request.js";

describe("buildOAuthTokenRequest", () => {
  it("builds a form body with client credentials in the body by default", () => {
    const { init } = buildOAuthTokenRequest(
      {
        token_url: "https://github.com/login/oauth/access_token",
        client_id: "gh-client",
        client_secret: "gh-secret",
        scopes: [],
      },
      { grant_type: "authorization_code", code: "abc" },
    );

    const headers = new Headers(init.headers);
    assert.equal(headers.get("Content-Type"), "application/x-www-form-urlencoded");
    assert.equal(headers.get("Authorization"), null);

    const params = new URLSearchParams(String(init.body));
    assert.equal(params.get("grant_type"), "authorization_code");
    assert.equal(params.get("code"), "abc");
    assert.equal(params.get("client_id"), "gh-client");
    assert.equal(params.get("client_secret"), "gh-secret");
  });

  it("builds a form body with client_id only for public OAuth clients", () => {
    const { init } = buildOAuthTokenRequest(
      {
        token_url: "https://mcp.notion.com/token",
        client_id: "mcp-client-id",
        scopes: [],
      },
      { grant_type: "authorization_code", code: "abc" },
    );

    const headers = new Headers(init.headers);
    assert.equal(headers.get("Content-Type"), "application/x-www-form-urlencoded");
    assert.equal(headers.get("Authorization"), null);

    const params = new URLSearchParams(String(init.body));
    assert.equal(params.get("client_id"), "mcp-client-id");
    assert.equal(params.get("client_secret"), null);
  });
});
