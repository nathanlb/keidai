import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { InMemoryTokenRepository } from "../../in-memory-token-repository.service.js";
import { DelegatedConnectionCredentialResolver } from "../delegated-connection-credential-resolver.service.js";
import {
  LINKING_REQUIRED_CODE,
  LinkingRequiredError,
} from "../../types/credential-resolution.js";
import { runWithAgentPrincipal } from "../../../identity/agent-principal-context.js";
import { STUB_AGENT_PRINCIPAL } from "../../../identity/stub-agent-principal.js";
import { withStubAgentPrincipal } from "../../tests/test-helpers.js";

const oauthProviders: ToriiConfig["oauth_providers"] = {
  github: {
    token_url: "https://github.com/login/oauth/access_token",
    client_id: "test-client-id",
    client_secret: "secret",
    scopes: ["repo"],
    redirect_uri: "http://localhost:3100/oauth/callback",
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
): DelegatedConnectionCredentialResolver {
  const configService = new ToriiConfigService({
    oauth_providers: oauthProviders,
    servers: [],
  });
  return new DelegatedConnectionCredentialResolver(repository, configService);
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

  it("returns linking_required when the stored token is expired", async () => {
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
