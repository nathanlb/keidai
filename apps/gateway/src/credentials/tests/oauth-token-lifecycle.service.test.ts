import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { OAuthTokenLifecycleService } from "../oauth-token-lifecycle.service.js";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";
import {
  OAuthTokenRefreshError,
  type OAuthFetch,
} from "../utils/oauth-token-refresh.js";

const oauthProviders: ToriiConfig["oauth_providers"] = {
  github: {
    token_url: "https://github.com/login/oauth/access_token",
    client_id: "test-client-id",
    client_secret: "secret",
    scopes: ["repo"],
    redirect_uri: "http://localhost:3100/oauth/callback",
  },
};

function createLifecycle(
  repository = new InMemoryTokenRepository(),
  fetchFn?: OAuthFetch,
  providers: ToriiConfig["oauth_providers"] = oauthProviders,
): OAuthTokenLifecycleService {
  const configService = new ToriiConfigService({
    oauth_providers: providers,
    servers: [],
  });
  return new OAuthTokenLifecycleService(repository, configService, fetchFn);
}

function mockRefreshFetch(options: {
  response?: Record<string, unknown> | string;
  status?: number;
  contentType?: string;
  delayMs?: number;
  onCall?: () => void;
  rejectWith?: Error;
}): OAuthFetch {
  return async () => {
    options.onCall?.();
    if (options.rejectWith) {
      throw options.rejectWith;
    }
    if (options.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    const body =
      typeof options.response === "string"
        ? options.response
        : JSON.stringify(options.response ?? {});

    return new Response(body, {
      status: options.status ?? 200,
      headers: {
        "content-type": options.contentType ?? "application/json",
      },
    });
  };
}

describe("OAuthTokenLifecycleService", () => {
  it("returns null when no token is stored", async () => {
    const lifecycle = createLifecycle();

    const token = await lifecycle.getValidToken("user-1", "github");

    assert.equal(token, null);
  });

  it("returns a valid token without calling the provider", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_valid",
      expiresAt: new Date(Date.now() + 60_000),
    });

    let refreshCalls = 0;
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({ onCall: () => { refreshCalls += 1; } }),
    );

    const token = await lifecycle.getValidToken("user-1", "github");

    assert.equal(token?.accessToken, "gho_valid");
    assert.equal(refreshCalls, 0);
  });

  it("treats tokens without expiresAt as always valid", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_no_expiry",
    });

    let refreshCalls = 0;
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({ onCall: () => { refreshCalls += 1; } }),
    );

    const token = await lifecycle.getValidToken("user-1", "github");

    assert.equal(token?.accessToken, "gho_no_expiry");
    assert.equal(refreshCalls, 0);
  });

  it("returns null when the access token is expired and no refresh token exists", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_expired",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const lifecycle = createLifecycle(repository);

    const token = await lifecycle.getValidToken("user-1", "github");

    assert.equal(token, null);
  });

  it("refreshes a stale token and persists the new access token", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({
        response: {
          access_token: "gho_refreshed",
          expires_in: 3600,
        },
      }),
    );

    const token = await lifecycle.getValidToken("user-1", "github");

    assert.equal(token?.accessToken, "gho_refreshed");
    const stored = await repository.get("user-1", "github");
    assert.equal(stored?.accessToken, "gho_refreshed");
    assert.equal(stored?.refreshToken, "ghr_stale");
  });

  it("persists a rotated refresh token from the provider response", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_old",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({
        response: {
          access_token: "gho_refreshed",
          refresh_token: "ghr_rotated",
          expires_in: 3600,
        },
      }),
    );

    await lifecycle.getValidToken("user-1", "github");

    const stored = await repository.get("user-1", "github");
    assert.equal(stored?.refreshToken, "ghr_rotated");
  });

  it("accepts form-encoded provider refresh responses", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({
        contentType: "application/x-www-form-urlencoded",
        response:
          "access_token=gho_form&refresh_token=ghr_form&expires_in=3600&token_type=bearer",
      }),
    );

    const token = await lifecycle.getValidToken("user-1", "github");

    assert.equal(token?.accessToken, "gho_form");
    assert.equal((await repository.get("user-1", "github"))?.refreshToken, "ghr_form");
  });

  it("single-flights concurrent refresh for the same owner and provider", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });

    let refreshCalls = 0;
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({
        delayMs: 50,
        onCall: () => { refreshCalls += 1; },
        response: {
          access_token: "gho_refreshed",
          expires_in: 3600,
        },
      }),
    );

    const [first, second] = await Promise.all([
      lifecycle.getValidToken("user-1", "github"),
      lifecycle.getValidToken("user-1", "github"),
    ]);

    assert.equal(refreshCalls, 1);
    assert.equal(first?.accessToken, "gho_refreshed");
    assert.equal(second?.accessToken, "gho_refreshed");
  });

  it("does not single-flight refresh across different owners", async () => {
    const repository = new InMemoryTokenRepository();
    const staleToken = {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    };
    await repository.set("user-1", "github", staleToken);
    await repository.set("user-2", "github", staleToken);

    let refreshCalls = 0;
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({
        onCall: () => { refreshCalls += 1; },
        response: {
          access_token: "gho_refreshed",
          expires_in: 3600,
        },
      }),
    );

    await Promise.all([
      lifecycle.getValidToken("user-1", "github"),
      lifecycle.getValidToken("user-2", "github"),
    ]);

    assert.equal(refreshCalls, 2);
  });

  it("releases the in-flight lock after refresh completes", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });

    let refreshCalls = 0;
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({
        onCall: () => { refreshCalls += 1; },
        response: {
          access_token: "gho_refreshed",
          expires_in: -120,
        },
      }),
    );

    await lifecycle.getValidToken("user-1", "github");
    await lifecycle.getValidToken("user-1", "github");

    assert.equal(refreshCalls, 2);
  });

  it("throws a terminal OAuthTokenRefreshError when the provider rejects the refresh grant", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_revoked",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({
        status: 400,
        response: {
          error: "invalid_grant",
          error_description: "The refresh token is invalid or expired",
        },
      }),
    );

    await assert.rejects(
      () => lifecycle.getValidToken("user-1", "github"),
      (error: unknown) => {
        assert.ok(error instanceof OAuthTokenRefreshError);
        assert.equal(error.terminal, true);
        return true;
      },
    );
  });

  it("throws a non-terminal OAuthTokenRefreshError on transient provider failures", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const lifecycle = createLifecycle(
      repository,
      mockRefreshFetch({ rejectWith: new Error("network down") }),
    );

    await assert.rejects(
      () => lifecycle.getValidToken("user-1", "github"),
      (error: unknown) => {
        assert.ok(error instanceof OAuthTokenRefreshError);
        assert.equal(error.terminal, false);
        return true;
      },
    );
  });

  it("throws when the provider is not defined in config", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("user-1", "unknown", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const lifecycle = createLifecycle(repository, undefined, {});

    await assert.rejects(
      () => lifecycle.getValidToken("user-1", "unknown"),
      /not defined in oauth_providers/,
    );
  });
});
