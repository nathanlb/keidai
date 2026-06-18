import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../backends/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../backends/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { GatewayMcpServer } from "../gateway-mcp-server.service.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";

function serverConfig(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
    policy: { default: "deny", allow: ["search_issues", "get_file_contents"] },
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

describe("Gateway MCP tools/list", () => {
  it("returns a unified namespaced tool list to agents", async () => {
    const backend = await startMockMcpServer({
      tools: [
        { name: "search_issues", description: "Search GitHub issues" },
        { name: "get_file_contents", description: "Read a repository file" },
      ],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serverConfig("github", backend.url)],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const toolCatalog = new ToolCatalogService(
      connectionManager,
      credentialResolver,
    );
    const gatewayMcpServer = new GatewayMcpServer(toolCatalog);

    const client = new Client({
      name: "integration-test-agent",
      version: "1.0.0",
    });

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayMcpServer.start();
      const transport = new StreamableHTTPClientTransport(new URL(gateway.url), {
        reconnectionOptions: {
          maxReconnectionDelay: 1000,
          initialReconnectionDelay: 100,
          reconnectionDelayGrowFactor: 1.5,
          maxRetries: 0,
        },
      });

      await client.connect(transport);
      const result = await client.listTools();

      assert.deepEqual(
        result.tools.map((tool) => tool.name).sort(),
        ["github.get_file_contents", "github.search_issues"],
      );

      await client.close();
      await gateway.close();
    } finally {
      await closeManagerConnections(connectionManager);
      await backend.close();
    }
  });
});
