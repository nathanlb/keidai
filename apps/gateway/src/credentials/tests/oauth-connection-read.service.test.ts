import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { InMemoryPendingLinkStore } from "../in-memory-pending-link-store.service.js";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";
import { OAuthConnectionReadService } from "../oauth-connection-read.service.js";

const sampleConfig: ToriiConfig = {
  oauth_providers: {
    github: {
      token_url: "https://github.com/login/oauth/access_token",
      client_id: "gh-client",
      client_secret: "gh-secret",
      scopes: ["repo"],
    },
    linear: {
      token_url: "https://api.linear.app/oauth/token",
      client_id: "linear-client",
      client_secret: "linear-secret",
      scopes: ["read"],
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

function createReadService(
  config: ToriiConfig = sampleConfig,
  options: {
    tokenRepository?: InMemoryTokenRepository;
    pendingLinkStore?: InMemoryPendingLinkStore;
  } = {},
): {
  service: OAuthConnectionReadService;
  tokenRepository: InMemoryTokenRepository;
  pendingLinkStore: InMemoryPendingLinkStore;
} {
  const tokenRepository = options.tokenRepository ?? new InMemoryTokenRepository();
  const pendingLinkStore =
    options.pendingLinkStore ?? new InMemoryPendingLinkStore();

  return {
    service: new OAuthConnectionReadService(
      new ToriiConfigService(config),
      tokenRepository,
      pendingLinkStore,
    ),
    tokenRepository,
    pendingLinkStore,
  };
}

describe("OAuthConnectionReadService", () => {
  it("reports not_linked for configured providers without grants", async () => {
    const { service } = createReadService();
    const result = await service.listConnections();

    assert.equal(result.connections.length, 2);
    assert.deepEqual(
      result.connections.map((connection) => ({
        provider: connection.provider,
        status: connection.status,
      })),
      [
        { provider: "github", status: "not_linked" },
        { provider: "linear", status: "not_linked" },
      ],
    );
  });

  it("reports pending when a link is in flight", async () => {
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const { service } = createReadService(sampleConfig, { pendingLinkStore });

    await pendingLinkStore.create({
      linkId: "link-1",
      ownerId: "demo-owner",
      provider: "github",
      redirectUri: "http://127.0.0.1:3100/oauth/callback/github",
      status: "pending",
      createdAt: new Date(),
    });

    const result = await service.listConnections();
    const github = result.connections.find(
      (connection) => connection.provider === "github",
    );

    assert.equal(github?.status, "pending");
    assert.equal(github?.ownerId, "demo-owner");
    assert.deepEqual(github?.scopes, ["repo"]);
  });

  it("reports linked and expired token states from stored grants", async () => {
    const tokenRepository = new InMemoryTokenRepository();
    const { service } = createReadService(sampleConfig, { tokenRepository });

    await tokenRepository.set("demo-owner", "github", {
      accessToken: "fresh-token",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await tokenRepository.set("demo-owner", "linear", {
      accessToken: "stale-token",
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });

    const result = await service.listConnections();
    const byProvider = new Map(
      result.connections.map((connection) => [connection.provider, connection]),
    );

    assert.equal(byProvider.get("github")?.status, "linked");
    assert.equal(
      byProvider.get("github")?.expiresAt,
      "2099-01-01T00:00:00.000Z",
    );
    assert.equal(byProvider.get("linear")?.status, "expired");
    assert.equal(JSON.stringify(result).includes("fresh-token"), false);
  });

  it("prefers stored grants over completed pending links", async () => {
    const tokenRepository = new InMemoryTokenRepository();
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const { service } = createReadService(sampleConfig, {
      tokenRepository,
      pendingLinkStore,
    });

    await tokenRepository.set("demo-owner", "github", {
      accessToken: "stored-token",
    });
    await pendingLinkStore.create({
      linkId: "link-1",
      ownerId: "demo-owner",
      provider: "github",
      redirectUri: "http://127.0.0.1:3100/oauth/callback/github",
      status: "completed",
      createdAt: new Date(),
    });

    const github = (await service.listConnections()).connections.find(
      (connection) => connection.provider === "github",
    );
    assert.equal(github?.status, "linked");
  });

  it("reports failed links from the latest pending store entry", async () => {
    const pendingLinkStore = new InMemoryPendingLinkStore();
    const { service } = createReadService(sampleConfig, { pendingLinkStore });

    await pendingLinkStore.create({
      linkId: "link-1",
      ownerId: "demo-owner",
      provider: "github",
      redirectUri: "http://127.0.0.1:3100/oauth/callback/github",
      status: "failed",
      error: "access denied",
      createdAt: new Date(),
    });

    const github = (await service.listConnections()).connections.find(
      (connection) => connection.provider === "github",
    );
    assert.equal(github?.status, "failed");
    assert.equal(github?.error, "access denied");
  });

  it("uses an explicit owner when provided", async () => {
    const tokenRepository = new InMemoryTokenRepository();
    const { service } = createReadService(sampleConfig, { tokenRepository });
    await tokenRepository.set("other-owner", "github", {
      accessToken: "other-token",
    });

    const result = await service.listConnections("other-owner");
    const github = result.connections.find(
      (connection) => connection.provider === "github",
    );

    assert.equal(github?.ownerId, "other-owner");
    assert.equal(github?.status, "linked");
  });
});
