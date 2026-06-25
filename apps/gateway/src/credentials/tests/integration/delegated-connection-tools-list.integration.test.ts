import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ConnectionManager } from "../../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../../connections/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { ToolCatalogService } from "../../../catalog/tool-catalog.service.js";
import { createCredentialServices, withStubAgentPrincipal } from "../test-helpers.js";
import { createPolicyEnforcement } from "../../../policy/tests/test-helpers.js";
import { STUB_AGENT_PRINCIPAL } from "../../../identity/stub-agent-principal.js";
import { createCapturingLogger, createNoopLogger } from "../../../logging/tests/test-helpers.js";

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

describe("user_oauth credentials with tools/list", () => {
  it("lists tools when a valid token is stored", async () => {
    const { tokenRepository, credentialResolver } = createCredentialServices();
    await tokenRepository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
      accessToken: "gho_valid",
    });

    const mockServer = await startMockMcpServer({
      requireAuth: true,
      tools: [{ name: "search_issues", description: "Search GitHub issues" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "client",
          client_secret: "secret",
          scopes: ["repo"],
          redirect_uri: "http://localhost:3100/oauth/callback",
        },
      },
      servers: [userOAuthServer("github", mockServer.url)],
    });
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const catalogService = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());

    try {
      await withStubAgentPrincipal(async () => {
        await connectionManager.connectAll();
        const tools = await catalogService.listToolsForAgent();

        assert.deepEqual(tools.map((tool) => tool.name), ["github.search_issues"]);
      });
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });

  it("skips the backend with a clear error when no token is stored", async () => {
    const { credentialResolver } = createCredentialServices();
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search GitHub issues" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "client",
          client_secret: "secret",
          scopes: ["repo"],
          redirect_uri: "http://localhost:3100/oauth/callback",
        },
      },
      servers: [userOAuthServer("github", mockServer.url)],
    });
    const logger = createCapturingLogger();
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), logger);
    const catalogService = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), logger);

    try {
      await withStubAgentPrincipal(async () => {
        await connectionManager.connectAll();
        const tools = await catalogService.listToolsForAgent();

        assert.deepEqual(tools, []);
        assert.equal(logger.logs.length, 1);
        assert.equal(logger.logs[0]?.event, "catalog.linking_required");
        assert.equal(logger.logs[0]?.fields.provider, "github");
        const serialized = JSON.stringify(logger.logs);
        assert.doesNotMatch(serialized, /Bearer/);
      });
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });
});
