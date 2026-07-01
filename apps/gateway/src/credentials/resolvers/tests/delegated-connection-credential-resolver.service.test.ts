import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { OAuthTokenLifecycleService } from "../../oauth-token-lifecycle.service.js";
import { InMemoryOAuthClientRepository } from "../../in-memory-oauth-client-repository.service.js";
import { InMemoryTokenRepository } from "../../in-memory-token-repository.service.js";
import { UserOAuthCredentialResolver } from "../user_oauth_credential-resolver.service.js";
import {
  LINKING_REQUIRED_CODE,
  LinkingRequiredError,
} from "../../types/credential-resolution.js";
import type { OAuthFetch } from "../../utils/oauth-token-refresh.js";
import { runWithAgentPrincipal } from "../../../identity/agent-principal-context.js";
import { STUB_AGENT_PRINCIPAL } from "../../../identity/stub-agent-principal.js";
import { withStubAgentPrincipal } from "../../tests/test-helpers.js";

const oauthProviders: ToriiConfig["oauth_providers"] = {
  github: {
    token_url: "https://github.com/login/oauth/access_token",
    client_id: "test-client-id",
    client_secret: "secret",
    scopes: ["repo"],
  },
};

function userOAuthServer(
  name = "github",
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url: "https://example.com/mcp" },
    credential: {
      strategy: "user_oauth",
      provider: "github",
    },
    policy: { default: "deny" },
  };
}

function createResolver(
  repository = new InMemoryTokenRepository(),
  fetchFn?: OAuthFetch,
): UserOAuthCredentialResolver {
  const configService = new ToriiConfigService({
    oauth_providers: oauthProviders,
    servers: [],
  });
  const tokenLifecycle = new OAuthTokenLifecycleService(
    repository,
    new InMemoryOAuthClientRepository(),
    configService,
    fetchFn,
  );
  return new UserOAuthCredentialResolver(tokenLifecycle, configService);
}

function mockRefreshFetch(options: {
  response?: Record<string, unknown>;
  status?: number;
  delayMs?: number;
  onCall?: () => void;
}): OAuthFetch {
  return async () => {
    options.onCall?.();
    if (options.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    return new Response(JSON.stringify(options.response ?? {}), {
      status: options.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("InMemoryTokenRepository", () => {
  it("stores and retrieves tokens by owner and provider", async () => {
    const repository = new InMemoryTokenRepository();

    await repository.set("user-1", "github", {
      accessToken: "gho_test",
      refreshToken: "ghr_test",
    });

    const token = await repository.get("user-1", "github");
    assert.equal(token?.accessToken, "gho_test");
    assert.equal(token?.refreshToken, "ghr_test");
    assert.equal(await repository.get("user-1", "stripe"), null);
  });
});

describe("DelegatedConnectionCredentialResolver", () => {
  it("injects a bearer token when one is stored for the principal owner", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_secret_token",
    });
    const resolver = createResolver(repository);

    const resolved = await withStubAgentPrincipal(() =>
      resolver.resolve(userOAuthServer()),
    );

    assert.equal(
      resolved.headers.Authorization,
      "Bearer gho_secret_token",
    );
    assert.equal(resolved.credentialRef, "github:stub-user");
  });

  it("returns linking_required when no token is stored", async () => {
    const resolver = createResolver();

    await assert.rejects(
      () =>
        withStubAgentPrincipal(() => resolver.resolve(userOAuthServer())),
      (error: unknown) => {
        assert.ok(error instanceof LinkingRequiredError);
        assert.equal(error.code, LINKING_REQUIRED_CODE);
        assert.equal(error.payload.code, LINKING_REQUIRED_CODE);
        assert.equal(error.payload.provider, "github");
        assert.equal(error.payload.ownerId, STUB_AGENT_PRINCIPAL.ownerId);
        assert.equal(error.payload.backend, "github");
        assert.match(error.payload.linkUrl, /client_id=test-client-id/);
        assert.match(error.payload.linkUrl, /scope=repo/);
        assert.doesNotMatch(error.message, /gho_/);
        assert.doesNotMatch(error.payload.linkUrl, /secret/);
        return true;
      },
    );
  });

  it("returns linking_required when the stored access token is expired and cannot be refreshed", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_expired",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = createResolver(repository);

    await assert.rejects(
      () =>
        withStubAgentPrincipal(() => resolver.resolve(userOAuthServer())),
      (error: unknown) => {
        assert.ok(error instanceof LinkingRequiredError);
        assert.equal(error.payload.code, LINKING_REQUIRED_CODE);
        assert.doesNotMatch(error.payload.linkUrl, /gho_expired/);
        return true;
      },
    );
  });

  it("refreshes a stale access token using the stored refresh token", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = createResolver(
      repository,
      mockRefreshFetch({
        response: {
          access_token: "gho_refreshed",
          expires_in: 3600,
        },
      }),
    );

    const resolved = await withStubAgentPrincipal(() =>
      resolver.resolve(userOAuthServer()),
    );

    assert.equal(
      resolved.headers.Authorization,
      "Bearer gho_refreshed",
    );
    const stored = await repository.get(STUB_AGENT_PRINCIPAL.ownerId, "github");
    assert.equal(stored?.accessToken, "gho_refreshed");
    assert.equal(stored?.refreshToken, "ghr_stale");
    assert.ok(stored?.expiresAt && stored.expiresAt.getTime() > Date.now());
  });

  it("persists a rotated refresh token before returning credentials", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_old",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = createResolver(
      repository,
      mockRefreshFetch({
        response: {
          access_token: "gho_refreshed",
          refresh_token: "ghr_rotated",
          expires_in: 3600,
        },
      }),
    );

    await withStubAgentPrincipal(() => resolver.resolve(userOAuthServer()));

    const stored = await repository.get(STUB_AGENT_PRINCIPAL.ownerId, "github");
    assert.equal(stored?.refreshToken, "ghr_rotated");
  });

  it("single-flights concurrent refresh for the same owner and backend", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });

    let refreshCalls = 0;
    const resolver = createResolver(
      repository,
      mockRefreshFetch({
        delayMs: 50,
        onCall: () => {
          refreshCalls += 1;
        },
        response: {
          access_token: "gho_refreshed",
          refresh_token: "ghr_rotated",
          expires_in: 3600,
        },
      }),
    );

    const [first, second] = await withStubAgentPrincipal(() =>
      Promise.all([
        resolver.resolve(userOAuthServer()),
        resolver.resolve(userOAuthServer()),
      ]),
    );

    assert.equal(refreshCalls, 1);
    assert.equal(
      first.headers.Authorization,
      "Bearer gho_refreshed",
    );
    assert.equal(
      second.headers.Authorization,
      "Bearer gho_refreshed",
    );
  });

  it("returns linking_required when refresh fails with a terminal provider error", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_revoked",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = createResolver(
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
      () =>
        withStubAgentPrincipal(() => resolver.resolve(userOAuthServer())),
      (error: unknown) => {
        assert.ok(error instanceof LinkingRequiredError);
        assert.equal(error.payload.code, LINKING_REQUIRED_CODE);
        assert.doesNotMatch(error.message, /ghr_revoked/);
        return true;
      },
    );
  });

  it("does not use another owner's stored token", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("other-owner", "github", {
      accessToken: "gho_other_owner",
    });
    const resolver = createResolver(repository);

    await assert.rejects(
      () =>
        withStubAgentPrincipal(() => resolver.resolve(userOAuthServer())),
      LinkingRequiredError,
    );
  });

  it("uses the token for the principal on the request context", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("context-owner", "github", {
      accessToken: "gho_context_owner",
    });
    const resolver = createResolver(repository);

    const resolved = await runWithAgentPrincipal(
      { agentId: "agent-1", ownerId: "context-owner", groups: [] },
      () => resolver.resolve(userOAuthServer()),
    );

    assert.equal(
      resolved.headers.Authorization,
      "Bearer gho_context_owner",
    );
    assert.equal(resolved.credentialRef, "github:context-owner");
  });
});
