import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../backends/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../backends/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../tool-catalog.service.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";

function serverConfig(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
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

describe("ToolCatalogService", () => {
  it("namespaces tools from connected backends", async () => {
    const mockServer = await startMockMcpServer({
      tools: [
        { name: "search_issues", description: "Search GitHub issues" },
        { name: "get_file_contents", description: "Read a repository file" },
      ],
    });
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serverConfig("github", mockServer.url)],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
    );

    try {
      await connectionManager.connectAll();
      const tools = await catalogService.listToolsForAgent();

      assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        ["github.get_file_contents", "github.search_issues"],
      );

      const searchIssues = tools.find((tool) => tool.name === "github.search_issues");
      assert.equal(searchIssues?.description, "Search GitHub issues");

      const catalog = catalogService.getCatalog();
      const fileTool = catalog.find(
        (entry) => entry.bareName === "get_file_contents",
      );
      assert.equal(fileTool?.namespacedName, "github.get_file_contents");
      assert.equal(fileTool?.server, "github");
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });

  it("skips failed backends and continues fan-out", async () => {
    const goodServer = await startMockMcpServer({
      tools: [{ name: "list_customers", description: "List Stripe customers" }],
    });
    const badServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        serverConfig("stripe", goodServer.url),
        serverConfig("deepwiki", badServer.url),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(configService, {
      connect: async (server) => {
        const client = await new DefaultMcpClientConnector(
          credentialResolver,
        ).connect(server);
        if (server.name === "deepwiki") {
          client.listTools = async () => {
            throw new Error("auth required");
          };
        }
        return client;
      },
    });
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
    );

    try {
      await connectionManager.connectAll();
      const tools = await catalogService.listToolsForAgent();

      assert.deepEqual(tools.map((tool) => tool.name), ["stripe.list_customers"]);
      assert.equal(catalogService.getCatalog().length, 1);
    } finally {
      await closeManagerConnections(connectionManager);
      await Promise.all([goodServer.close(), badServer.close()]);
    }
  });

  it("ignores backends not in connected state", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "ping", description: "Ping" }],
    });
    const closedUrl = mockServer.url;
    await mockServer.close();

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serverConfig("offline", closedUrl)],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
    );

    await connectionManager.connectAll();
    const tools = await catalogService.listToolsForAgent();

    assert.deepEqual(tools, []);
    assert.deepEqual(catalogService.getCatalog(), []);
  });
});
