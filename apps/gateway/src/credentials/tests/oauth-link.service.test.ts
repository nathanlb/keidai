import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { InMemoryOAuthClientRepository } from "../in-memory-oauth-client-repository.service.js";
import { InMemoryPendingLinkStore } from "../in-memory-pending-link-store.service.js";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";
import { OAuthLinkService } from "../oauth-link.service.js";
import { encodeOAuthLinkState } from "../utils/oauth-link-state.js";
import {
  createCapturingLogger,
} from "../../logging/tests/test-helpers.js";

const sampleConfig: ToriiConfig = {
  oauth_providers: {
    github: {
      token_url: "https://github.com/login/oauth/access_token",
      client_id: "gh-client",
      client_secret: "gh-secret",
      scopes: ["repo"],
    },
  },
  servers: [],
  agents: [
    {
      subject: {
        kind: "k8s_service_account",
        namespace: "torii-agents",
        service_account: "demo-agent",
      },
      agent_id: "demo-agent-01",
      owner_id: "demo-owner",
      groups: ["agents"],
    },
  ],
};

function createOAuthLinkService(
  config: ToriiConfig = sampleConfig,
  options: {
    tokenRepository?: InMemoryTokenRepository;
    pendingLinkStore?: InMemoryPendingLinkStore;
    logger?: ReturnType<typeof createCapturingLogger>;
  } = {},
): {
  service: OAuthLinkService;
  tokenRepository: InMemoryTokenRepository;
  pendingLinkStore: InMemoryPendingLinkStore;
  logger: ReturnType<typeof createCapturingLogger>;
} {
  const tokenRepository = options.tokenRepository ?? new InMemoryTokenRepository();
  const pendingLinkStore =
    options.pendingLinkStore ?? new InMemoryPendingLinkStore();
  const logger = options.logger ?? createCapturingLogger();
  const configService = new ToriiConfigService(config);

  return {
    service: new OAuthLinkService(
      configService,
      tokenRepository,
      new InMemoryOAuthClientRepository(),
      pendingLinkStore,
      logger,
    ),
    tokenRepository,
    pendingLinkStore,
    logger,
  };
}

function mockTokenExchange(response: Record<string, unknown> = {}): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes("github.com/login/oauth/access_token")) {
      return new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          ...response,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return originalFetch(input, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

describe("OAuthLinkService", () => {
  it("builds callback redirect URIs from the gateway base URL", () => {
    const { service } = createOAuthLinkService();
    assert.equal(
      service.buildCallbackRedirectUri("http://127.0.0.1:3100/", "github"),
      "http://127.0.0.1:3100/oauth/callback/github",
    );
  });

  it("initiate stores a pending link and returns an authorization URL", async () => {
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const { service } = createOAuthLinkService(sampleConfig, { pendingLinkStore });

    const result = await service.initiate(
      "github",
      "http://127.0.0.1:3100",
      "demo-owner",
    );

    assert.ok(result.linkId);
    assert.match(result.authorizationUrl, /github\.com\/login\/oauth\/authorize/);

    const pending = await pendingLinkStore.getLatest("demo-owner", "github");
    assert.equal(pending?.status, "pending");
    assert.equal(pending?.linkId, result.linkId);
    assert.ok(pending?.codeVerifier);
  });

  it("initiate rejects unknown providers", async () => {
    const { service } = createOAuthLinkService();
    await assert.rejects(
      () => service.initiate("missing", "http://127.0.0.1:3100"),
      /Unknown OAuth provider "missing"/,
    );
  });

  it("completeCallback marks the pending link failed when the provider returns an error", async () => {
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const { service } = createOAuthLinkService(sampleConfig, { pendingLinkStore });
    const { linkId } = await service.initiate(
      "github",
      "http://127.0.0.1:3100",
    );
    const state = encodeOAuthLinkState({
      ownerId: "demo-owner",
      provider: "github",
      linkId,
    });

    const result = await service.completeCallback("github", {
      error: "access_denied",
      error_description: "User denied access",
      state,
    });

    assert.deepEqual(result, {
      success: false,
      error: "User denied access",
    });
    const pending = await pendingLinkStore.get(linkId);
    assert.equal(pending?.status, "failed");
    assert.equal(pending?.error, "User denied access");
  });

  it("completeCallback rejects callbacks missing code or state", async () => {
    const { service } = createOAuthLinkService();

    assert.deepEqual(await service.completeCallback("github", {}), {
      success: false,
      error: "OAuth callback missing code or state",
    });
    assert.deepEqual(
      await service.completeCallback("github", { code: "only-code" }),
      {
        success: false,
        error: "OAuth callback missing code or state",
      },
    );
  });

  it("completeCallback rejects invalid state payloads", async () => {
    const { service } = createOAuthLinkService();

    const result = await service.completeCallback("github", {
      code: "auth-code",
      state: "not-valid-base64url-json",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /OAuth callback state validation failed/);
  });

  it("completeCallback rejects provider mismatches and marks the link failed", async () => {
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const { service } = createOAuthLinkService(sampleConfig, { pendingLinkStore });
    const { linkId } = await service.initiate(
      "github",
      "http://127.0.0.1:3100",
    );
    const state = encodeOAuthLinkState({
      ownerId: "demo-owner",
      provider: "github",
      linkId,
    });

    const result = await service.completeCallback("linear", {
      code: "auth-code",
      state,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /does not match "linear"/);
    assert.equal((await pendingLinkStore.get(linkId))?.status, "failed");
  });

  it("completeCallback rejects callbacks without a UI link id", async () => {
    const { service } = createOAuthLinkService();
    const state = encodeOAuthLinkState({
      ownerId: "demo-owner",
      provider: "github",
    });

    const result = await service.completeCallback("github", {
      code: "auth-code",
      state,
    });

    assert.deepEqual(result, {
      success: false,
      error: "OAuth callback has no matching pending link",
    });
  });

  it("completeCallback rejects already completed links", async () => {
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const { service } = createOAuthLinkService(sampleConfig, { pendingLinkStore });
    const { linkId } = await service.initiate(
      "github",
      "http://127.0.0.1:3100",
    );
    await pendingLinkStore.update({
      ...(await pendingLinkStore.get(linkId))!,
      status: "completed",
    });
    const state = encodeOAuthLinkState({
      ownerId: "demo-owner",
      provider: "github",
      linkId,
    });

    const result = await service.completeCallback("github", {
      code: "auth-code",
      state,
    });

    assert.deepEqual(result, {
      success: false,
      error: "OAuth link is already completed",
    });
  });

  it("completeCallback stores tokens and completes the pending link on success", async () => {
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const tokenRepository = new InMemoryTokenRepository();
    const { service } = createOAuthLinkService(sampleConfig, {
      pendingLinkStore,
      tokenRepository,
    });
    const { linkId } = await service.initiate(
      "github",
      "http://127.0.0.1:3100",
    );
    const state = encodeOAuthLinkState({
      ownerId: "demo-owner",
      provider: "github",
      linkId,
    });
    const restoreFetch = mockTokenExchange();

    try {
      const result = await service.completeCallback("github", {
        code: "auth-code",
        state,
      });

      assert.deepEqual(result, { success: true });
      assert.equal(
        (await tokenRepository.get("demo-owner", "github"))?.accessToken,
        "new-access-token",
      );
      assert.equal((await pendingLinkStore.get(linkId))?.status, "completed");
    } finally {
      restoreFetch();
    }
  });

  it("completeCallback marks the link failed when token exchange fails", async () => {
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const { service } = createOAuthLinkService(sampleConfig, { pendingLinkStore });
    const { linkId } = await service.initiate(
      "github",
      "http://127.0.0.1:3100",
    );
    const state = encodeOAuthLinkState({
      ownerId: "demo-owner",
      provider: "github",
      linkId,
    });
    const restoreFetch = (() => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("github.com/login/oauth/access_token")) {
          return new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return originalFetch(input, init);
      };
      return () => {
        globalThis.fetch = originalFetch;
      };
    })();

    try {
      const result = await service.completeCallback("github", {
        code: "bad-code",
        state,
      });

      assert.equal(result.success, false);
      assert.match(result.error ?? "", /OAuth code exchange failed/);
      assert.equal((await pendingLinkStore.get(linkId))?.status, "failed");
    } finally {
      restoreFetch();
    }
  });

  it("unlink removes stored grants for the resolved owner", async () => {
    const tokenRepository = new InMemoryTokenRepository();
    const { service } = createOAuthLinkService(sampleConfig, { tokenRepository });
    await tokenRepository.set("demo-owner", "github", {
      accessToken: "token",
    });

    assert.equal(await service.unlink("github"), true);
    assert.equal(await tokenRepository.get("demo-owner", "github"), null);
    assert.equal(await service.unlink("github"), false);
  });

  it("unlink rejects unknown providers", async () => {
    const { service } = createOAuthLinkService();
    await assert.rejects(
      () => service.unlink("missing"),
      /Unknown OAuth provider "missing"/,
    );
  });

  it("emits structured OAuth lifecycle events without secrets", async () => {
    const { service, pendingLinkStore, logger } = createOAuthLinkService();
    const restoreFetch = mockTokenExchange();

    try {
      const initiated = await service.initiate(
        "github",
        "http://127.0.0.1:3100",
      );
      assert.ok(
        logger.logs.some(
          (entry) =>
            entry.event === "oauth.initiated" &&
            entry.fields.provider === "github" &&
            entry.fields.ownerId === "demo-owner",
        ),
      );

      const state = encodeOAuthLinkState({
        provider: "github",
        ownerId: "demo-owner",
        linkId: initiated.linkId,
      });
      const result = await service.completeCallback("github", {
        code: "auth-code-value",
        state,
      });

      assert.equal(result.success, true);
      assert.ok(
        logger.logs.some(
          (entry) =>
            entry.event === "oauth.callback_success" &&
            entry.fields.ownerId === "demo-owner",
        ),
      );

      assert.equal(await service.unlink("github"), true);
      assert.ok(
        logger.logs.some(
          (entry) =>
            entry.event === "oauth.unlinked" &&
            entry.fields.ownerId === "demo-owner",
        ),
      );

      const serialized = JSON.stringify(logger.logs);
      assert.doesNotMatch(serialized, /auth-code-value/);
      assert.doesNotMatch(serialized, /new-access-token/);
      assert.doesNotMatch(serialized, /new-refresh-token/);
      assert.doesNotMatch(serialized, /gh-secret/);
    } finally {
      restoreFetch();
    }
  });

  it("logs oauth.callback_failed without OAuth secrets", async () => {
    const { service, logger } = createOAuthLinkService();
    const result = await service.completeCallback("github", {
      error: "access_denied",
      error_description: "User denied access",
      state: encodeOAuthLinkState({
        provider: "github",
        ownerId: "demo-owner",
        linkId: "link-1",
      }),
    });

    assert.equal(result.success, false);
    const failure = logger.logs.find(
      (entry) => entry.event === "oauth.callback_failed",
    );
    assert.ok(failure);
    assert.equal(failure.fields.provider, "github");
    assert.equal(failure.fields.ownerId, "demo-owner");
    assert.match(String(failure.fields.error), /denied/i);
    assert.doesNotMatch(JSON.stringify(logger.logs), /gh-secret/);
  });
});
