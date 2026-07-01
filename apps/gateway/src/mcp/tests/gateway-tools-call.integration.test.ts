import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { createCredentialServices, withStubAgentPrincipal } from "../../credentials/tests/test-helpers.js";
import { createTestGatewayHttpServer } from "../../http/tests/test-helpers.js";
import { connectAgentToGateway } from "../../identity/tests/test-helpers.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createPolicyEnforcement } from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";

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
    await tokenRepository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
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
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      new CapturingTraceEmitter(),
      createPolicyEnforcement(configService),
    );
    const gatewayHttpServer = createTestGatewayHttpServer(toolCatalog, toolDispatch);

    try {
      await withStubAgentPrincipal(async () => {
        await connectionManager.connectAll();
      });
      const gateway = await gatewayHttpServer.start();
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

  it("returns policy_denied for tools blocked by backend policy", async () => {
    const backend = await startMockMcpServer({
      tools: [
        { name: "search_issues", description: "Search GitHub issues" },
        { name: "merge_pull_request", description: "Merge a pull request" },
      ],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          name: "github",
          transport: { type: "http", url: backend.url },
          credential: { strategy: "none" },
          policy: { default: "deny", allow: ["search_issues"] },
        },
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
    );
    const gatewayHttpServer = createTestGatewayHttpServer(toolCatalog, toolDispatch);

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayHttpServer.start();
      const agent = await connectAgentToGateway(gateway.url);

      try {
        const tools = await agent.client.listTools();
        assert.deepEqual(tools.tools.map((tool) => tool.name), [
          "github.search_issues",
        ]);

        const allowed = await agent.client.callTool({
          name: "github.search_issues",
          arguments: {},
        });
        assert.notEqual(allowed.isError, true);

        await assert.rejects(
          () =>
            agent.client.callTool({
              name: "github.merge_pull_request",
              arguments: {},
            }),
          /policy_denied: github.merge_pull_request/,
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

  it("returns a clean MCP error for unknown tools allowed by policy", async () => {
    const backend = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search GitHub issues" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          ...noneServer("github", backend.url),
          policy: { default: "deny", allow: ["search_issues", "missing_tool"] },
        },
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
    );
    const gatewayHttpServer = createTestGatewayHttpServer(toolCatalog, toolDispatch);

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayHttpServer.start();
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
