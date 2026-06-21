import "reflect-metadata";
import assert from "node:assert/strict";
import type { IncomingHttpHeaders } from "node:http";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ConnectionManager } from "../../../backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../../backends/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../../backends/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { ToolCatalogService } from "../../../catalog/tool-catalog.service.js";
import { bootBackends, createCredentialServices, withStubAgentPrincipal } from "../test-helpers.js";
import { createPolicyEnforcement } from "../../../policy/tests/test-helpers.js";

function noneServer(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
    policy: { default: "deny", allow: ["read_wiki_structure"] },
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

function assertNoAuthorizationHeader(headers: IncomingHttpHeaders[]): void {
  assert.ok(headers.length > 0);
  for (const headerSet of headers) {
    assert.equal(headerSet.authorization, undefined);
  }
}

describe("none credentials with tools/list", () => {
  it("lists tools without sending Authorization", async () => {
    const receivedHeaders: IncomingHttpHeaders[] = [];
    const mockServer = await startMockMcpServer({
      tools: [
        {
          name: "read_wiki_structure",
          description: "Read wiki structure for a repository",
        },
      ],
      onRequest: (req) => {
        receivedHeaders.push({ ...req.headers });
      },
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [noneServer("deepwiki", mockServer.url)],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const tools = await withStubAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      assert.deepEqual(tools.map((tool) => tool.name), [
        "deepwiki.read_wiki_structure",
      ]);
      assertNoAuthorizationHeader(receivedHeaders);
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });
});

describe("none credentials with tools/call", () => {
  it("calls tools without sending Authorization", async () => {
    const receivedHeaders: IncomingHttpHeaders[] = [];
    const mockServer = await startMockMcpServer({
      tools: [
        {
          name: "read_wiki_structure",
          description: "Read wiki structure for a repository",
        },
      ],
      onRequest: (req) => {
        receivedHeaders.push({ ...req.headers });
      },
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [noneServer("deepwiki", mockServer.url)],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );

    try {
      await connectionManager.connectAll();
      const connection = connectionManager.get("deepwiki");
      assert.ok(connection?.client);

      const result = await connection.client.callTool({
        name: "read_wiki_structure",
        arguments: {},
      });

      assert.notEqual(result.isError, true);
      assertNoAuthorizationHeader(receivedHeaders);
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });
});

describe("none credentials with DeepWiki MCP", () => {
  it("lists and calls tools from DeepWiki", async () => {
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          name: "deepwiki",
          transport: {
            type: "http",
            url: "https://mcp.deepwiki.com/mcp",
          },
          credential: { strategy: "none" },
          policy: { default: "deny", allow: ["read_wiki_structure"] },
        },
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const tools = await withStubAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      assert.ok(tools.some((tool) => tool.name === "deepwiki.read_wiki_structure"));

      const connection = connectionManager.get("deepwiki");
      assert.ok(connection?.client);

      const result = await connection.client.callTool({
        name: "read_wiki_structure",
        arguments: { repoName: "facebook/react" },
      });

      assert.notEqual(result.isError, true);
    } finally {
      await closeManagerConnections(connectionManager);
    }
  });
});
