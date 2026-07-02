import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConfigReadService } from "../../config/config-read.service.js";
import type {
  ConfigAgentsResponse,
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
import { createPolicyEnforcement } from "../../policy/tests/test-helpers.js";
import { GatewayHttpServer } from "../gateway-http-server.service.js";
import { GatewayMcpServer } from "../../mcp/gateway-mcp-server.service.js";
import { createOAuthApiController, createStubToolCatalog, createTestGatewayHttpServer } from "./test-helpers.js";
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
      policy: { default: "deny" },
    },
  ],
  agents: [
    {
      subject: {
        kind: "k8s_service_account",
        namespace: "torii-agents",
        service_account: "demo-agent",
      },
      agent_id: "demo-agent-01",
      owner_id: "demo-owner",
      groups: ["agents"],
      inbound_token: "bearer-secret",
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
      const [serversRes, providersRes, agentsRes] = await Promise.all([
        fetch(`${gateway.baseUrl}/api/config/servers`),
        fetch(`${gateway.baseUrl}/api/config/oauth-providers`),
        fetch(`${gateway.baseUrl}/api/config/agents`),
      ]);

      assert.equal(serversRes.status, 200);
      assert.equal(providersRes.status, 200);
      assert.equal(agentsRes.status, 200);

      const servers = (await serversRes.json()) as ConfigServersResponse;
      const providers =
        (await providersRes.json()) as ConfigOAuthProvidersResponse;
      const agents = (await agentsRes.json()) as ConfigAgentsResponse;

      assert.deepEqual(servers, {
        servers: [
          {
            name: "github",
            transport: { type: "http", url: "https://example.com/mcp" },
            credential: { strategy: "user_oauth", provider: "github" },
            policy: { default: "deny" },
          },
        ],
      });
      assert.deepEqual(providers.providers.github, {
        token_url: "https://github.com/login/oauth/access_token",
        client_id: "gh-client",
        scopes: ["repo"],
      });
      assert.deepEqual(agents, {
        agents: [
          {
            agent_id: "demo-agent-01",
            owner_id: "demo-owner",
            subject: {
              kind: "k8s_service_account",
              namespace: "torii-agents",
              service_account: "demo-agent",
            },
            groups: ["agents"],
          },
        ],
      });

      const body = JSON.stringify({ servers, providers, agents });
      assert.equal(body.includes("gh-secret"), false);
      assert.equal(body.includes("bearer-secret"), false);
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
    const gatewayHttpServer = new GatewayHttpServer(
      new ConfigApiController(new ConfigReadService(configService)),
      new ConnectionsApiController(
        new ConnectionReadService(connectionManager, toolCatalog),
        connectionManager,
      ),
      createOAuthApiController(configService),
      new GatewayMcpServer(
        {} as ToolCatalogService,
        {} as ToolDispatchService,
        {} as never,
        new CapturingTraceEmitter(),
        createNoopLogger(),
      ),
      createNoopLogger(),
    );
    const gateway = await gatewayHttpServer.start();

    try {
      const [serversRes, providersRes, agentsRes] = await Promise.all([
        fetch(`${gateway.baseUrl}/api/config/servers`),
        fetch(`${gateway.baseUrl}/api/config/oauth-providers`),
        fetch(`${gateway.baseUrl}/api/config/agents`),
      ]);

      assert.deepEqual(await serversRes.json(), { servers: [] });
      assert.deepEqual(await providersRes.json(), { providers: {} });
      assert.deepEqual(await agentsRes.json(), { agents: [] });
    } finally {
      await gateway.close();
    }
  });
});
