import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../connection-manager.service.js";
import type { McpClientConnector } from "../types/mcp-client-connector.js";
import { DefaultMcpClientConnector } from "../mcp-client-connector.service.js";
import { startMockMcpServer } from "./mock-mcp-server.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";

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
    policy: { default: "deny" },
  };
}

async function closeManagerConnections(
  manager: ConnectionManager,
): Promise<void> {
  await Promise.all(
    manager
      .list()
      .map((connection) => connection.client?.close())
      .filter((close): close is Promise<void> => close !== undefined),
  );
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
    );

    try {
      await manager.connectAll();

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
        serverConfig("good", goodServer.url, { strategy: "service_key", key: "sk_test" }),
        serverConfig("bad", badServer.url, { strategy: "user_oauth", provider: "github" }),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const manager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );

    try {
      await manager.connectAll();

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
    );

    try {
      await manager.connectAll();

      const states = new Map(
        manager.list().map((connection) => [connection.config.name, connection.state]),
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
    const manager = new ConnectionManager(configService, connector);

    await manager.connectAll();

    assert.equal(manager.get("missing"), undefined);
    assert.equal(manager.get("github")?.state, "failed");
    assert.equal(manager.get("github")?.config.name, "github");
  });
});
