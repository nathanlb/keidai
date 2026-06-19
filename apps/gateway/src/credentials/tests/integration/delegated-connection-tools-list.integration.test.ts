import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ConnectionManager } from "../../../backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../../backends/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../../backends/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { ToolCatalogService } from "../../../catalog/tool-catalog.service.js";
import { createCredentialServices, withStubAgentPrincipal } from "../test-helpers.js";
import { STUB_AGENT_PRINCIPAL } from "../../../identity/stub-agent-principal.js";

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
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
    );

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
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
    );

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (message?: unknown) => {
      errors.push(String(message));
    };

    try {
      await withStubAgentPrincipal(async () => {
        await connectionManager.connectAll();
        const tools = await catalogService.listToolsForAgent();

        assert.deepEqual(tools, []);
        assert.equal(errors.length, 1);
        assert.match(
          errors[0] ?? "",
          /requires OAuth linking for provider "github"/,
        );
        assert.doesNotMatch(errors[0] ?? "", /Bearer/);
      });
    } finally {
      console.error = originalError;
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });
});
