import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { OAuthTokenLifecycleService } from "../../oauth-token-lifecycle.service.js";
import { MockOAuthClientRepository } from "../../../testing/mocks/mock-oauth-client-repository.js";
import { MockTokenRepository } from "../../../testing/mocks/mock-token-repository.js";
import { UserOAuthCredentialResolver } from "../user_oauth_credential-resolver.service.js";
import {
  LINKING_REQUIRED_CODE,
  LinkingRequiredError,
  CredentialResolutionError,
} from "../../types/credential-resolution.js";
import type { OAuthFetch } from "../../utils/oauth-token-refresh.js";
import { runWithAgentPrincipal } from "../../../identity/agent-principal-context.js";
import { TEST_AGENT_PRINCIPAL } from "../../../identity/tests/test-helpers.js";
import { withMockFetch, withTestAgentPrincipal } from "../../tests/test-helpers.js";

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
  };
}

function createResolver(
  repository = new MockTokenRepository(),
): UserOAuthCredentialResolver {
  const configService = new ToriiConfigService({
    oauth_providers: oauthProviders,
    servers: [],
  });
  const tokenLifecycle = new OAuthTokenLifecycleService(
    repository,
    new MockOAuthClientRepository(),
    configService,
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

describe("DelegatedConnectionCredentialResolver", () => {
  it("injects a bearer token when one is stored for the principal owner", async () => {
    const repository = new MockTokenRepository();
    await repository.set(TEST_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_secret_token",
    });
    const resolver = createResolver(repository);

    const resolved = await withTestAgentPrincipal(() =>
      resolver.resolve(userOAuthServer()),
    );

    assert.equal(
      resolved.headers.Authorization,
      "Bearer gho_secret_token",
    );
    assert.equal(resolved.credentialRef, "github:test-owner");
  });

  it("returns linking_required when no token is stored", async () => {
    const resolver = createResolver();

    await assert.rejects(
      () =>
        withTestAgentPrincipal(() => resolver.resolve(userOAuthServer())),
      (error: unknown) => {
        assert.ok(error instanceof LinkingRequiredError);
        assert.equal(error.code, LINKING_REQUIRED_CODE);
        assert.equal(error.payload.code, LINKING_REQUIRED_CODE);
        assert.equal(error.payload.provider, "github");
        assert.equal(error.payload.ownerId, TEST_AGENT_PRINCIPAL.ownerId);
        assert.equal(error.payload.backend, "github");
        assert.match(error.payload.linkUrl, /client_id=test-client-id/);
        assert.match(error.payload.linkUrl, /scope=repo/);
        assert.doesNotMatch(error.message, /gho_/);
        assert.doesNotMatch(error.payload.linkUrl, /secret/);
        return true;
      },
    );
  });

  it("returns CredentialResolutionError when no agent principal is set", async () => {
    const resolver = createResolver();

    await assert.rejects(
      () => resolver.resolve(userOAuthServer()),
      (error: unknown) => {
        assert.ok(error instanceof CredentialResolutionError);
        assert.match(error.message, /no agent principal/);
        return true;
      },
    );
  });

  it("returns linking_required when the stored access token is expired and cannot be refreshed", async () => {
    const repository = new MockTokenRepository();
    await repository.set(TEST_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_expired",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = createResolver(repository);

    await assert.rejects(
      () =>
        withTestAgentPrincipal(() => resolver.resolve(userOAuthServer())),
      (error: unknown) => {
        assert.ok(error instanceof LinkingRequiredError);
        assert.equal(error.payload.code, LINKING_REQUIRED_CODE);
        assert.doesNotMatch(error.payload.linkUrl, /gho_expired/);
        return true;
      },
    );
  });

  it("refreshes a stale access token using the stored refresh token", async () => {
    const repository = new MockTokenRepository();
    await repository.set(TEST_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = createResolver(repository);

    const resolved = await withMockFetch(
      mockRefreshFetch({
        response: {
          access_token: "gho_refreshed",
          expires_in: 3600,
          token_type: "bearer",
        },
      }),
      () =>
        withTestAgentPrincipal(() => resolver.resolve(userOAuthServer())),
    );

    assert.equal(
      resolved.headers.Authorization,
      "Bearer gho_refreshed",
    );
    const stored = await repository.get(TEST_AGENT_PRINCIPAL.ownerId, "github");
    assert.equal(stored?.accessToken, "gho_refreshed");
    assert.equal(stored?.refreshToken, "ghr_stale");
    assert.ok(stored?.expiresAt && stored.expiresAt.getTime() > Date.now());
  });

  it("persists a rotated refresh token before returning credentials", async () => {
    const repository = new MockTokenRepository();
    await repository.set(TEST_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_old",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = createResolver(repository);

    await withMockFetch(
      mockRefreshFetch({
        response: {
          access_token: "gho_refreshed",
          refresh_token: "ghr_rotated",
          expires_in: 3600,
          token_type: "bearer",
        },
      }),
      () => withTestAgentPrincipal(() => resolver.resolve(userOAuthServer())),
    );

    const stored = await repository.get(TEST_AGENT_PRINCIPAL.ownerId, "github");
    assert.equal(stored?.refreshToken, "ghr_rotated");
  });

  it("single-flights concurrent refresh for the same owner and backend", async () => {
    const repository = new MockTokenRepository();
    await repository.set(TEST_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_stale",
      expiresAt: new Date(Date.now() - 60_000),
    });

    let refreshCalls = 0;
    const resolver = createResolver(repository);

    const [first, second] = await withMockFetch(
      mockRefreshFetch({
        delayMs: 50,
        onCall: () => {
          refreshCalls += 1;
        },
        response: {
          access_token: "gho_refreshed",
          refresh_token: "ghr_rotated",
          expires_in: 3600,
          token_type: "bearer",
        },
      }),
      () =>
        withTestAgentPrincipal(() =>
          Promise.all([
            resolver.resolve(userOAuthServer()),
            resolver.resolve(userOAuthServer()),
          ]),
        ),
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
    const repository = new MockTokenRepository();
    await repository.set(TEST_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_stale",
      refreshToken: "ghr_revoked",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = createResolver(repository);

    await withMockFetch(
      mockRefreshFetch({
        status: 400,
        response: {
          error: "invalid_grant",
          error_description: "The refresh token is invalid or expired",
        },
      }),
      () =>
        assert.rejects(
          () =>
            withTestAgentPrincipal(() => resolver.resolve(userOAuthServer())),
          (error: unknown) => {
            assert.ok(error instanceof LinkingRequiredError);
            assert.equal(error.payload.code, LINKING_REQUIRED_CODE);
            assert.doesNotMatch(error.message, /ghr_revoked/);
            return true;
          },
        ),
    );
  });

  it("does not use another owner's stored token", async () => {
    const repository = new MockTokenRepository();
    await repository.set("other-owner", "github", {
      accessToken: "gho_other_owner",
    });
    const resolver = createResolver(repository);

    await assert.rejects(
      () =>
        withTestAgentPrincipal(() => resolver.resolve(userOAuthServer())),
      LinkingRequiredError,
    );
  });

  it("uses the token for the principal on the request context", async () => {
    const repository = new MockTokenRepository();
    await repository.set("context-owner", "github", {
      accessToken: "gho_context_owner",
    });
    const resolver = createResolver(repository);

    const resolved = await runWithAgentPrincipal(
      { agentId: "agent-1", ownerId: "context-owner", groups: [], bearerId: "test-bearer" },
      () => resolver.resolve(userOAuthServer()),
    );

    assert.equal(
      resolved.headers.Authorization,
      "Bearer gho_context_owner",
    );
    assert.equal(resolved.credentialRef, "github:context-owner");
  });
});
