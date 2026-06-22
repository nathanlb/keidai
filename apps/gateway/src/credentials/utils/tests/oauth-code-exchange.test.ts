import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OAuthProviderConfig } from "@keidai/shared";
import {
  exchangeAuthorizationCode,
  type OAuthFetch,
} from "../oauth-code-exchange.js";

const githubProvider: OAuthProviderConfig = {
  token_url: "https://github.com/login/oauth/access_token",
  client_id: "test-client-id",
  client_secret: "top-secret",
  scopes: ["repo"],
  redirect_uri: "http://127.0.0.1:8765/callback",
};

function mockFetch(response: {
  body?: string;
  status?: number;
  contentType?: string;
  rejectWith?: Error;
}): OAuthFetch {
  return async () => {
    if (response.rejectWith) {
      throw response.rejectWith;
    }

    return new Response(response.body ?? "", {
      status: response.status ?? 200,
      headers: {
        "content-type": response.contentType ?? "application/json",
      },
    });
  };
}

describe("exchangeAuthorizationCode", () => {
  it("posts an authorization_code grant to the provider token_url", async () => {
    let capturedBody = "";
    const fetchFn: OAuthFetch = async (_input, init) => {
      capturedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          access_token: "gho_new",
          refresh_token: "ghr_new",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await exchangeAuthorizationCode(
      githubProvider,
      "auth-code-123",
      "http://127.0.0.1:8765/callback",
      "verifier-123",
      fetchFn,
    );

    const params = new URLSearchParams(capturedBody);
    assert.equal(params.get("grant_type"), "authorization_code");
    assert.equal(params.get("code"), "auth-code-123");
    assert.equal(params.get("redirect_uri"), "http://127.0.0.1:8765/callback");
    assert.equal(params.get("code_verifier"), "verifier-123");
    assert.equal(params.get("client_id"), "test-client-id");
    assert.equal(params.get("client_secret"), "top-secret");
  });

  it("returns a token from a JSON provider response", async () => {
    const token = await exchangeAuthorizationCode(
      githubProvider,
      "auth-code-123",
      "http://127.0.0.1:8765/callback",
      undefined,
      mockFetch({
        body: JSON.stringify({
          access_token: "gho_new",
          refresh_token: "ghr_new",
          expires_in: 3600,
        }),
      }),
    );

    assert.equal(token.accessToken, "gho_new");
    assert.equal(token.refreshToken, "ghr_new");
    assert.ok(token.expiresAt && token.expiresAt.getTime() > Date.now());
  });

  it("throws a terminal error for provider 4xx responses", async () => {
    await assert.rejects(
      () =>
        exchangeAuthorizationCode(
          githubProvider,
          "bad-code",
          "http://127.0.0.1:8765/callback",
          undefined,
          mockFetch({
            status: 400,
            body: JSON.stringify({
              error: "invalid_grant",
              error_description: "bad verification code",
            }),
          }),
        ),
      /bad verification code/,
    );
  });
});
