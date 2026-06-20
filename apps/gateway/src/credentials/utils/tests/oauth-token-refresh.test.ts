import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OAuthProviderConfig } from "@torii/shared";
import {
  OAuthTokenRefreshError,
  refreshOAuthToken,
  toRefreshedToken,
  type OAuthFetch,
} from "../oauth-token-refresh.js";

const githubProvider: OAuthProviderConfig = {
  token_url: "https://github.com/login/oauth/access_token",
  client_id: "test-client-id",
  client_secret: "top-secret",
  scopes: ["repo"],
  redirect_uri: "http://localhost:3100/oauth/callback",
};

function mockFetch(response: {
  body?: string;
  status?: number;
  contentType?: string;
  rejectWith?: Error;
}): OAuthFetch {
  return async (input, init) => {
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

describe("toRefreshedToken", () => {
  it("maps a JSON refresh response onto an OAuthToken", () => {
    const token = toRefreshedToken(
      { accessToken: "old", refreshToken: "ghr_old" },
      {
        access_token: "gho_new",
        refresh_token: "ghr_new",
        expires_in: 3600,
      },
    );

    assert.equal(token.accessToken, "gho_new");
    assert.equal(token.refreshToken, "ghr_new");
    assert.ok(token.expiresAt && token.expiresAt.getTime() > Date.now());
  });

  it("keeps the existing refresh token when the provider does not rotate it", () => {
    const token = toRefreshedToken(
      { accessToken: "old", refreshToken: "ghr_existing" },
      { access_token: "gho_new" },
    );

    assert.equal(token.accessToken, "gho_new");
    assert.equal(token.refreshToken, "ghr_existing");
    assert.equal(token.expiresAt, undefined);
  });

  it("throws a terminal error when the response omits access_token", () => {
    assert.throws(
      () =>
        toRefreshedToken(
          { accessToken: "old", refreshToken: "ghr_old" },
          { access_token: "" },
        ),
      (error: unknown) => {
        assert.ok(error instanceof OAuthTokenRefreshError);
        assert.equal(error.terminal, true);
        return true;
      },
    );
  });
});

describe("refreshOAuthToken", () => {
  it("posts a refresh_token grant to the provider token_url", async () => {
    let capturedUrl: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchFn: OAuthFetch = async (input, init) => {
      capturedUrl = input;
      capturedInit = init;
      return new Response(
        JSON.stringify({ access_token: "gho_new", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await refreshOAuthToken(githubProvider, "ghr_stale", fetchFn);

    assert.equal(capturedUrl, githubProvider.token_url);
    assert.equal(capturedInit?.method, "POST");
    assert.equal(
      capturedInit?.headers &&
        new Headers(capturedInit.headers).get("Content-Type"),
      "application/x-www-form-urlencoded",
    );

    const params = new URLSearchParams(String(capturedInit?.body));
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("refresh_token"), "ghr_stale");
    assert.equal(params.get("client_id"), "test-client-id");
    assert.equal(params.get("client_secret"), "top-secret");
  });

  it("returns a refreshed token from a JSON provider response", async () => {
    const token = await refreshOAuthToken(
      githubProvider,
      "ghr_stale",
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

  it("returns a refreshed token from a form-encoded provider response", async () => {
    const token = await refreshOAuthToken(
      githubProvider,
      "ghr_stale",
      mockFetch({
        contentType: "application/x-www-form-urlencoded",
        body: "access_token=gho_form&refresh_token=ghr_form&expires_in=3600&token_type=bearer",
      }),
    );

    assert.equal(token.accessToken, "gho_form");
    assert.equal(token.refreshToken, "ghr_form");
  });

  it("throws a terminal error for provider 4xx invalid_grant responses", async () => {
    await assert.rejects(
      () =>
        refreshOAuthToken(
          githubProvider,
          "ghr_revoked",
          mockFetch({
            status: 400,
            body: JSON.stringify({
              error: "invalid_grant",
              error_description: "The refresh token is invalid or expired",
            }),
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OAuthTokenRefreshError);
        assert.equal(error.terminal, true);
        assert.match(error.message, /invalid or expired/);
        return true;
      },
    );
  });

  it("throws a terminal error for form-encoded provider error responses", async () => {
    await assert.rejects(
      () =>
        refreshOAuthToken(
          githubProvider,
          "ghr_revoked",
          mockFetch({
            status: 400,
            contentType: "application/x-www-form-urlencoded",
            body: "error=invalid_grant&error_description=bad%20token",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OAuthTokenRefreshError);
        assert.equal(error.terminal, true);
        assert.match(error.message, /bad token/);
        return true;
      },
    );
  });

  it("throws a non-terminal error for provider 5xx responses", async () => {
    await assert.rejects(
      () =>
        refreshOAuthToken(
          githubProvider,
          "ghr_stale",
          mockFetch({
            status: 503,
            body: "Service Unavailable",
            contentType: "text/plain",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OAuthTokenRefreshError);
        assert.equal(error.terminal, false);
        return true;
      },
    );
  });

  it("throws a non-terminal error when the provider request fails", async () => {
    await assert.rejects(
      () =>
        refreshOAuthToken(
          githubProvider,
          "ghr_stale",
          mockFetch({ rejectWith: new Error("network down") }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OAuthTokenRefreshError);
        assert.equal(error.terminal, false);
        assert.match(error.message, /network down/);
        return true;
      },
    );
  });
});
