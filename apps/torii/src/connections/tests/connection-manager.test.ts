import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../connection-manager.service.js";
import type { McpClientConnector } from "../types/mcp-client-connector.js";
import { DefaultMcpClientConnector } from "../mcp-client-connector.service.js";
import { startMockMcpServer } from "./mock-mcp-server.js";
import {
  createCredentialServices,
  withTestAgentPrincipal,
} from "../../credentials/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";

function serverConfig(
  name: string,
  url: string,
  credential: ToriiConfig["servers"][number]["credential"] = {
    strategy: "none",
  },
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential,
  };
}

async function closeManagerConnections(
  manager: ConnectionManager,
): Promise<void> {
  await manager.closeAll();
}

describe("ConnectionManager", () => {
  it("connects to a mock MCP server and tracks connected state", async () => {
    const mockServer = await startMockMcpServer();
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serverConfig("alpha", mockServer.url)],
    });
    const { credentialResolver } = createCredentialServices();
    const manager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );

    try {
      await withTestAgentPrincipal(() => manager.connectAll());

      const connection = manager.get("alpha");
      assert.equal(connection?.state, "connected");
      assert.ok(connection?.client);
      assert.equal(connection?.config.credential.strategy, "none");
      assert.equal(connection?.error, undefined);
    } finally {
      await closeManagerConnections(manager);
      await mockServer.close();
    }
  });

  it("marks failed backends without blocking other connections", async () => {
    const goodServer = await startMockMcpServer();
    const badServer = await startMockMcpServer({ rejectConnections: true });
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        serverConfig("good", goodServer.url, {
          strategy: "service_key",
          key: "sk_test",
        }),
        serverConfig("bad", badServer.url, {
          strategy: "user_oauth",
          provider: "github",
        }),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const manager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );

    try {
      await withTestAgentPrincipal(() => manager.connectAll());

      const good = manager.get("good");
      const bad = manager.get("bad");

      assert.equal(good?.state, "connected");
      assert.ok(good?.client);
      assert.equal(good?.config.credential.strategy, "service_key");

      assert.equal(bad?.state, "failed");
      assert.equal(bad?.client, null);
      assert.ok(bad?.error);
      assert.equal(bad?.config.credential.strategy, "user_oauth");
    } finally {
      await closeManagerConnections(manager);
      await Promise.all([goodServer.close(), badServer.close()]);
    }
  });

  it("tracks a mixed fleet after boot", async () => {
    const reachable = await startMockMcpServer();
    const closedServer = await startMockMcpServer();
    const unreachableUrl = closedServer.url;
    await closedServer.close();
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        serverConfig("reachable", reachable.url),
        serverConfig("unreachable", unreachableUrl),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const manager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );

    try {
      await withTestAgentPrincipal(() => manager.connectAll());

      const states = new Map(
        manager
          .list()
          .map((connection) => [connection.config.name, connection.state]),
      );

      assert.equal(states.get("reachable"), "connected");
      assert.equal(states.get("unreachable"), "failed");
      assert.equal(manager.list().length, 2);
    } finally {
      await closeManagerConnections(manager);
      await reachable.close();
    }
  });

  it("exposes the registry by server name", async () => {
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serverConfig("github", "http://127.0.0.1:9/mcp")],
    });

    const connector: McpClientConnector = {
      connect: async () => {
        throw new Error("offline");
      },
    };
    const manager = new ConnectionManager(
      configService,
      connector,
      createNoopLogger(),
    );

    await manager.connectAll();

    assert.equal(manager.get("missing"), undefined);
    assert.equal(manager.get("github")?.state, "failed");
    assert.equal(manager.get("github")?.config.name, "github");
  });

  it("connects user_oauth backends without principal (handshake fails open)", async () => {
    const mockServer = await startMockMcpServer();
    const { credentialResolver } = createCredentialServices();

    const configService = new ToriiConfigService({
      oauth_providers: {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "client",
          client_secret: "secret",
          scopes: ["repo"],
        },
      },
      servers: [
        serverConfig("github", mockServer.url, {
          strategy: "user_oauth",
          provider: "github",
        }),
      ],
    });
    const manager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );

    try {
      await manager.connectAll();
      assert.equal(manager.get("github")?.state, "connected");
      assert.equal(manager.get("github")?.client, null);

      await manager.reconnect("github");
      assert.equal(manager.get("github")?.state, "connected");
      assert.equal(manager.get("github")?.client, null);
      assert.equal(manager.get("github")?.error, undefined);

      // Even when the unscoped reachability baseline is connected, each owner
      // opens their own isolated MCP client via ensureConnected and unscoped
      // get() never returns another owner's client.
      const ownerAConn = await manager.ensureConnected("github", "owner-a");
      const ownerBConn = await manager.ensureConnected("github", "owner-b");
      assert.ok(ownerAConn.client);
      assert.ok(ownerBConn.client);
      assert.notStrictEqual(ownerAConn.client, ownerBConn.client);
      assert.equal(manager.get("github")?.client, null);
    } finally {
      await closeManagerConnections(manager);
      await mockServer.close();
    }
  });

  it("reconnects auth-required user_oauth backends once an agent principal is present", async () => {
    const mockServer = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: "linked-access-token",
    });
    const { credentialResolver, tokenRepository } = createCredentialServices();
    await tokenRepository.set("test-owner", "github", {
      accessToken: "linked-access-token",
    });

    const configService = new ToriiConfigService({
      oauth_providers: {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "client",
          client_secret: "secret",
          scopes: ["repo"],
        },
      },
      servers: [
        serverConfig("github", mockServer.url, {
          strategy: "user_oauth",
          provider: "github",
        }),
      ],
    });
    const manager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );

    try {
      await manager.connectAll();
      assert.equal(manager.get("github")?.state, "failed");

      await withTestAgentPrincipal(() => manager.ensureUserOAuthConnected());
      assert.equal(manager.get("github", "test-owner")?.state, "connected");
      assert.ok(manager.get("github", "test-owner")?.client);
      assert.equal(manager.get("github")?.state, "failed");
      assert.equal(manager.get("github")?.client, null);
    } finally {
      await closeManagerConnections(manager);
      await mockServer.close();
    }
  });

  it("isolates user_oauth connections by owner so unlinked owners do not clobber linked owners", async () => {
    const seenAuthHeaders: string[] = [];
    const mockServer = await startMockMcpServer({
      requireAuth: true,
      onRequest: (req) => {
        if (typeof req.headers.authorization === "string") {
          seenAuthHeaders.push(req.headers.authorization);
        }
      },
    });
    const oauthProviders = {
      github: {
        token_url: "https://github.com/login/oauth/access_token",
        client_id: "client",
        client_secret: "secret",
        scopes: ["repo"],
      },
    };
    const { credentialResolver, tokenRepository } = createCredentialServices({
      oauth_providers: oauthProviders,
    });
    await tokenRepository.set("owner-a", "github", {
      accessToken: "token-owner-a",
    });
    await tokenRepository.set("owner-b", "github", {
      accessToken: "token-owner-b",
    });

    const configService = new ToriiConfigService({
      oauth_providers: oauthProviders,
      servers: [
        serverConfig("github", mockServer.url, {
          strategy: "user_oauth",
          provider: "github",
        }),
      ],
    });
    const manager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );

    try {
      await manager.connectAll();
      assert.equal(manager.get("github", "owner-a")?.state, "failed");

      await manager.reconnect("github", "owner-a");
      const ownerAConn = manager.get("github", "owner-a");
      assert.equal(ownerAConn?.state, "connected");
      assert.ok(ownerAConn?.client);

      // Unlinked owner-c fails to connect, but owner-a's client stays open and connected.
      await manager.reconnect("github", "owner-c");
      assert.equal(manager.get("github", "owner-c")?.state, "failed");
      assert.equal(manager.get("github", "owner-c")?.client, null);
      assert.equal(manager.get("github", "owner-a")?.state, "connected");
      assert.strictEqual(
        manager.get("github", "owner-a")?.client,
        ownerAConn?.client,
      );

      // Linked owner-b gets a distinct MCP client with their own token.
      await manager.reconnect("github", "owner-b");
      const ownerBConn = manager.get("github", "owner-b");
      assert.equal(ownerBConn?.state, "connected");
      assert.ok(ownerBConn?.client);
      assert.notStrictEqual(ownerAConn?.client, ownerBConn?.client);
      assert.ok(seenAuthHeaders.includes("Bearer token-owner-a"));
      assert.ok(seenAuthHeaders.includes("Bearer token-owner-b"));

      // Evicting owner-a closes only owner-a's connection, leaving owner-b connected.
      await manager.evictOwnerConnections("owner-a", "github");
      assert.equal(manager.get("github", "owner-a")?.state, "failed");
      assert.equal(manager.get("github", "owner-a")?.client, null);
      assert.equal(manager.get("github", "owner-b")?.state, "connected");
      assert.strictEqual(
        manager.get("github", "owner-b")?.client,
        ownerBConn?.client,
      );
    } finally {
      await closeManagerConnections(manager);
      await mockServer.close();
    }
  });
});
