import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  OAuthConnectionsResponse,
  OAuthInitiateResponse,
  ToriiConfig,
} from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { InMemoryOAuthClientRepository } from "../../credentials/in-memory-oauth-client-repository.service.js";
import { InMemoryPendingLinkStore } from "../../credentials/in-memory-pending-link-store.service.js";
import { InMemoryTokenRepository } from "../../credentials/in-memory-token-repository.service.js";
import { decodeOAuthLinkState } from "../../credentials/utils/oauth-link-state.js";
import {
  createOAuthApiController,
  createTestGatewayHttpServer,
} from "./test-helpers.js";

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

describe("Gateway OAuth linking API", () => {
  it("initiate returns an authorization URL for configured providers", async () => {
    const tokenRepository = new InMemoryTokenRepository();
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const configService = new ToriiConfigService(sampleConfig);
    const gatewayHttpServer = createTestGatewayHttpServer(
      {} as never,
      {} as never,
      {
        configService,
        oauthApi: createOAuthApiController(configService, {
          tokenRepository,
          clientRepository: new InMemoryOAuthClientRepository(),
          pendingLinkStore,
        }),
      },
    );

    const gateway = await gatewayHttpServer.start();
    try {
      const response = await fetch(
        `${gateway.baseUrl}/api/oauth/initiate/github`,
        { method: "POST" },
      );
      assert.equal(response.status, 200);

      const body = (await response.json()) as OAuthInitiateResponse;
      const url = new URL(body.authorizationUrl);
      assert.equal(
        url.origin + url.pathname,
        "https://github.com/login/oauth/authorize",
      );
      assert.equal(url.searchParams.get("client_id"), "gh-client");
      assert.ok(url.searchParams.get("state"));
      assert.ok(body.linkId);

      const state = decodeOAuthLinkState(url.searchParams.get("state") ?? "");
      assert.equal(state.ownerId, "demo-owner");
      assert.equal(state.provider, "github");
      assert.equal(state.linkId, body.linkId);

      const redirectUri = url.searchParams.get("redirect_uri");
      assert.equal(redirectUri, `${gateway.baseUrl}/oauth/callback/github`);

      assert.doesNotMatch(body.authorizationUrl, /gh-secret/);
      assert.doesNotMatch(JSON.stringify(body), /accessToken/);
    } finally {
      await gateway.close();
    }
  });

  it("connections reports link status without exposing tokens", async () => {
    const tokenRepository = new InMemoryTokenRepository();
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const configService = new ToriiConfigService(sampleConfig);
    const gatewayHttpServer = createTestGatewayHttpServer(
      {} as never,
      {} as never,
      {
        configService,
        oauthApi: createOAuthApiController(configService, {
          tokenRepository,
          pendingLinkStore,
        }),
      },
    );

    await tokenRepository.set("demo-owner", "github", {
      accessToken: "secret-access-token",
      refreshToken: "secret-refresh-token",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    const gateway = await gatewayHttpServer.start();
    try {
      const response = await fetch(`${gateway.baseUrl}/api/oauth/connections`);
      assert.equal(response.status, 200);

      const body = (await response.json()) as OAuthConnectionsResponse;
      assert.equal(body.connections.length, 1);

      const github = body.connections[0];
      assert.equal(github?.provider, "github");
      assert.equal(github?.ownerId, "demo-owner");
      assert.equal(github?.status, "linked");
      assert.deepEqual(github?.scopes, ["repo"]);
      assert.equal(github?.expiresAt, "2099-01-01T00:00:00.000Z");
      assert.equal(JSON.stringify(body).includes("secret"), false);
    } finally {
      await gateway.close();
    }
  });

  it("unlink removes stored grant for owner and provider", async () => {
    const tokenRepository = new InMemoryTokenRepository();
    const configService = new ToriiConfigService(sampleConfig);
    const gatewayHttpServer = createTestGatewayHttpServer(
      {} as never,
      {} as never,
      {
        configService,
        oauthApi: createOAuthApiController(configService, { tokenRepository }),
      },
    );

    await tokenRepository.set("demo-owner", "github", {
      accessToken: "secret-access-token",
    });

    const gateway = await gatewayHttpServer.start();
    try {
      const deleteResponse = await fetch(
        `${gateway.baseUrl}/api/oauth/connections/github`,
        { method: "DELETE" },
      );
      assert.equal(deleteResponse.status, 204);

      const listResponse = await fetch(`${gateway.baseUrl}/api/oauth/connections`);
      const body = (await listResponse.json()) as OAuthConnectionsResponse;
      assert.equal(body.connections[0]?.status, "not_linked");

      const missingResponse = await fetch(
        `${gateway.baseUrl}/api/oauth/connections/github`,
        { method: "DELETE" },
      );
      assert.equal(missingResponse.status, 404);
    } finally {
      await gateway.close();
    }
  });

  it("callback completes UI-initiated flows on success and error paths", async () => {
    const tokenRepository = new InMemoryTokenRepository();
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const configService = new ToriiConfigService(sampleConfig);
    const gatewayHttpServer = createTestGatewayHttpServer(
      {} as never,
      {} as never,
      {
        configService,
        oauthApi: createOAuthApiController(configService, {
          tokenRepository,
          pendingLinkStore,
        }),
      },
    );

    const gateway = await gatewayHttpServer.start();
    try {
      const initiateResponse = await fetch(
        `${gateway.baseUrl}/api/oauth/initiate/github`,
        { method: "POST" },
      );
      const initiate = (await initiateResponse.json()) as OAuthInitiateResponse;
      const state = new URL(initiate.authorizationUrl).searchParams.get("state");

      const errorResponse = await fetch(
        `${gateway.baseUrl}/oauth/callback/github?error=access_denied&state=${encodeURIComponent(state ?? "")}`,
      );
      assert.equal(errorResponse.status, 400);
      assert.match(await errorResponse.text(), /Authorization failed/);

      const connectionsAfterError = (await (
        await fetch(`${gateway.baseUrl}/api/oauth/connections`)
      ).json()) as OAuthConnectionsResponse;
      assert.equal(connectionsAfterError.connections[0]?.status, "failed");

      const initiateAgain = await fetch(
        `${gateway.baseUrl}/api/oauth/initiate/github`,
        { method: "POST" },
      );
      const initiateBody =
        (await initiateAgain.json()) as OAuthInitiateResponse;
      const successState = new URL(
        initiateBody.authorizationUrl,
      ).searchParams.get("state");

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
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return originalFetch(input, init);
      };

      try {
        const successResponse = await fetch(
          `${gateway.baseUrl}/oauth/callback/github?code=test-code&state=${encodeURIComponent(successState ?? "")}`,
        );
        assert.equal(successResponse.status, 200);
        assert.match(await successResponse.text(), /Authorization complete/);

        const token = await tokenRepository.get("demo-owner", "github");
        assert.equal(token?.accessToken, "new-access-token");

        const connectionsAfterSuccess = (await (
          await fetch(`${gateway.baseUrl}/api/oauth/connections`)
        ).json()) as OAuthConnectionsResponse;
        assert.equal(connectionsAfterSuccess.connections[0]?.status, "linked");
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      await gateway.close();
    }
  });
});
