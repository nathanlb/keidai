import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConfigReadService } from "../../config/config-read.service.js";
import type {
  ConfigGroupsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
} from "@keidai/shared";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { ConnectionsApiController } from "../../connections/connections-api.controller.js";
import { ConnectionReadService } from "../../connections/connection-read.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { ConfigApiController } from "../../config/config-api.controller.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { createPolicyEnforcement, createApprovalServices } from "../../policy/tests/test-helpers.js";
import { GatewayHttpServer } from "../gateway-http-server.service.js";
import { GatewayMcpServer } from "../../mcp/gateway-mcp-server.service.js";
import { createOAuthApiController, createStubToolCatalog, createTestGatewayHttpServer, createTracesApiController } from "./test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";

const sampleConfig: ToriiConfig = {
  oauth_providers: {
    github: {
      token_url: "https://github.com/login/oauth/access_token",
      client_id: "gh-client",
      client_secret: "gh-secret",
      scopes: ["repo"],
    },
  },
  servers: [
    {
      name: "github",
      transport: { type: "http", url: "https://example.com/mcp" },
      credential: { strategy: "user_oauth", provider: "github" },
    },
  ],
  groups: [
    {
      name: "agents",
      description: "Demo agent access",
      permissions: [{ server: "github", tools: ["search_issues"] }],
    },
  ],
};

function createGateway(): GatewayHttpServer {
  const configService = new ToriiConfigService(sampleConfig);
  const { credentialResolver } = createCredentialServices();
  const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
  const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
  const toolDispatch = new ToolDispatchService(
    toolCatalog,
    connectionManager,
    credentialResolver,
    new CapturingTraceEmitter(),
      createPolicyEnforcement(configService),
      createApprovalServices(configService).approvalGate,
      createApprovalServices(configService).taskStore,
    );

  return createTestGatewayHttpServer(toolCatalog, toolDispatch, {
    configService,
  });
}

describe("Gateway /api/config endpoints", () => {
  it("returns boot-loaded config without secrets", async () => {
    const gatewayHttpServer = createGateway();
    const gateway = await gatewayHttpServer.start();

    try {
      const [serversRes, providersRes, agentsRes, groupsRes] = await Promise.all([
        fetch(`${gateway.baseUrl}/api/config/servers`),
        fetch(`${gateway.baseUrl}/api/config/oauth-providers`),
        fetch(`${gateway.baseUrl}/api/config/agents`),
        fetch(`${gateway.baseUrl}/api/config/groups`),
      ]);

      assert.equal(serversRes.status, 200);
      assert.equal(providersRes.status, 200);
      assert.equal(agentsRes.status, 404);
      assert.equal(groupsRes.status, 200);

      const servers = (await serversRes.json()) as ConfigServersResponse;
      const providers =
        (await providersRes.json()) as ConfigOAuthProvidersResponse;
      const groups = (await groupsRes.json()) as ConfigGroupsResponse;

      assert.deepEqual(servers, {
        servers: [
          {
            name: "github",
            transport: { type: "http", url: "https://example.com/mcp" },
            credential: { strategy: "user_oauth", provider: "github" },
            policy: { default: "deny", allow: ["search_issues"] },
          },
        ],
      });
      assert.deepEqual(providers.providers.github, {
        token_url: "https://github.com/login/oauth/access_token",
        client_id: "gh-client",
        scopes: ["repo"],
      });
      assert.deepEqual(groups, {
        groups: [{ name: "agents", description: "Demo agent access" }],
      });

      const body = JSON.stringify({ servers, providers, groups });
      assert.equal(body.includes("gh-secret"), false);
    } finally {
      await gateway.close();
    }
  });

  it("returns empty collections when config has no entries", async () => {
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [],
    });
    const connectionManager = new ConnectionManager(
      configService,
      {
        connect: async () => {
          throw new Error("unused");
        },
      },
      createNoopLogger(),
    );
    const toolCatalog = createStubToolCatalog();
    const { approvalsApi } = createApprovalServices(configService);
    const gatewayHttpServer = new GatewayHttpServer(
      new ConfigApiController(new ConfigReadService(configService)),
      new ConnectionsApiController(
        new ConnectionReadService(connectionManager, toolCatalog),
        connectionManager,
        toolCatalog,
      ),
      createOAuthApiController(configService),
      createTracesApiController({ traceEmitter: new CapturingTraceEmitter() }),
      approvalsApi,
      new GatewayMcpServer(
        {} as ToolCatalogService,
        {} as ToolDispatchService,
        {} as never,
        {} as never,
        new CapturingTraceEmitter(),
        createNoopLogger(),
      ),
      createNoopLogger(),
    );
    const gateway = await gatewayHttpServer.start();

    try {
      const [serversRes, providersRes, groupsRes] = await Promise.all([
        fetch(`${gateway.baseUrl}/api/config/servers`),
        fetch(`${gateway.baseUrl}/api/config/oauth-providers`),
        fetch(`${gateway.baseUrl}/api/config/groups`),
      ]);

      assert.deepEqual(await serversRes.json(), { servers: [] });
      assert.deepEqual(await providersRes.json(), { providers: {} });
      assert.deepEqual(await groupsRes.json(), { groups: [] });
    } finally {
      await gateway.close();
    }
  });
});
