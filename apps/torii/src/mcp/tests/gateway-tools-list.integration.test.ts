import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { createTestGatewayHttpServer } from "../../http/tests/test-helpers.js";
import { connectAgentToGateway } from "../../identity/tests/test-helpers.js";
import { createPolicyEnforcement, createApprovalServices } from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { testAgentsGroup } from "../../testing/test-config.js";

function serverConfig(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
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
      groups: [
        testAgentsGroup([
          { server: "github", tools: ["search_issues", "get_file_contents"] },
        ]),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      new CapturingTraceEmitter(),
      createPolicyEnforcement(configService),
      (await createApprovalServices(configService)).approvalGate,
      (await createApprovalServices(configService)).taskStore,
    );
    const gatewayHttpServer = await createTestGatewayHttpServer(toolCatalog, toolDispatch);

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayHttpServer.start();
      const agent = await connectAgentToGateway(gateway.url);

      try {
        const result = await agent.client.listTools();

        assert.deepEqual(
          result.tools.map((tool) => tool.name),
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
