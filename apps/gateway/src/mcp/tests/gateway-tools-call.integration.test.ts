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
import { STUB_OBO_SUBJECT } from "../../credentials/utils/obo-subject.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { GatewayMcpServer } from "../gateway-mcp-server.service.js";

function userOAuthServer(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: {
      strategy: "user_oauth",
      provider: "github",
      subject: "${request.user}",
    },
    policy: { default: "deny", allow: ["search_issues"] },
  };
}

function serviceKeyServer(
  name: string,
  url: string,
  key = "sk_test_secret_key",
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: {
      strategy: "service_key",
      key,
    },
    policy: { default: "deny", allow: ["list_customers"] },
  };
}

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

async function connectAgentToGateway(
  gatewayUrl: string,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const client = new Client({
    name: "integration-test-agent",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(gatewayUrl), {
    reconnectionOptions: {
      maxReconnectionDelay: 1000,
      initialReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 0,
    },
  });
  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

describe("Gateway MCP tools/call", () => {
  it("routes user_oauth, service_key, and none backends end-to-end", async () => {
    const githubToken = "gho_valid";
    const stripeKey = "sk_test_secret_key";
    const githubBackend = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: githubToken,
      tools: [{ name: "search_issues", description: "Search GitHub issues" }],
    });
    const stripeBackend = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: stripeKey,
      tools: [{ name: "list_customers", description: "List Stripe customers" }],
    });
    const deepwikiBackend = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });

    const { tokenRepository, credentialResolver } = createCredentialServices();
    await tokenRepository.set(STUB_OBO_SUBJECT, "github", {
      accessToken: githubToken,
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
        userOAuthServer("github", githubBackend.url),
        serviceKeyServer("stripe", stripeBackend.url, stripeKey),
        noneServer("deepwiki", deepwikiBackend.url),
      ],
    });
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const toolCatalog = new ToolCatalogService(
      connectionManager,
      credentialResolver,
    );
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
    );
    const gatewayMcpServer = new GatewayMcpServer(toolCatalog, toolDispatch);

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayMcpServer.start();
      const agent = await connectAgentToGateway(gateway.url);

      try {
        await agent.client.listTools();

        const githubResult = await agent.client.callTool({
          name: "github.search_issues",
          arguments: { query: "is:open" },
        });
        assert.notEqual(githubResult.isError, true);

        const stripeResult = await agent.client.callTool({
          name: "stripe.list_customers",
          arguments: {},
        });
        assert.notEqual(stripeResult.isError, true);

        const deepwikiResult = await agent.client.callTool({
          name: "deepwiki.read_wiki_structure",
          arguments: {},
        });
        assert.notEqual(deepwikiResult.isError, true);
      } finally {
        await agent.close();
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await Promise.all([
        githubBackend.close(),
        stripeBackend.close(),
        deepwikiBackend.close(),
      ]);
    }
  });

  it("returns a clean MCP error for unknown tools", async () => {
    const backend = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search GitHub issues" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [noneServer("github", backend.url)],
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
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
    );
    const gatewayMcpServer = new GatewayMcpServer(toolCatalog, toolDispatch);

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayMcpServer.start();
      const agent = await connectAgentToGateway(gateway.url);

      try {
        await agent.client.listTools();

        await assert.rejects(
          () =>
            agent.client.callTool({
              name: "github.missing_tool",
              arguments: {},
            }),
          /Unknown tool: github.missing_tool/,
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
