import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../backends/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../backends/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import {
  connectAgentToGateway,
  createTestGatewayMcpServer,
} from "../../identity/tests/test-helpers.js";
import { createPolicyEnforcement } from "../../policy/tests/test-helpers.js";

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
      createPolicyEnforcement(configService),
    );
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      new CapturingTraceEmitter(),
      createPolicyEnforcement(configService),
    );
    const gatewayMcpServer = createTestGatewayMcpServer(toolCatalog, toolDispatch);

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayMcpServer.start();
      const agent = await connectAgentToGateway(gateway.url);

      try {
        const result = await agent.client.listTools();

        assert.deepEqual(
          result.tools.map((tool) => tool.name).sort(),
          ["github.get_file_contents", "github.search_issues"],
        );
      } finally {
        await agent.close();
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await backend.close();
    }
  });
});
