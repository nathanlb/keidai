import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ConnectionManager } from "../../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../../connections/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { ToolCatalogService } from "../../../catalog/tool-catalog.service.js";
import { bootBackends, createCredentialServices, withStubAgentPrincipal } from "../test-helpers.js";
import { createPolicyEnforcement } from "../../../policy/tests/test-helpers.js";
import { createCapturingLogger } from "../../../logging/tests/test-helpers.js";

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

describe("service_key credentials with tools/list", () => {
  it("lists tools when a valid bearer key is configured", async () => {
    const secretKey = "sk_test_secret_key";
    const mockServer = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: secretKey,
      tools: [{ name: "list_customers", description: "List Stripe customers" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serviceKeyServer("stripe", mockServer.url, secretKey)],
    });
    const { credentialResolver } = createCredentialServices();
    const logger = createCapturingLogger();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      logger,
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      logger,
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const tools = await withStubAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      assert.deepEqual(tools.map((tool) => tool.name), ["stripe.list_customers"]);
      const serialized = JSON.stringify(logger.logs);
      assert.doesNotMatch(serialized, new RegExp(secretKey));
      assert.doesNotMatch(serialized, /Bearer/);
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });

  it("marks the backend failed when auth is rejected at connect", async () => {
    const validKey = "sk_test_secret_key";
    const wrongKey = "sk_test_wrong";
    const mockServer = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: validKey,
      tools: [{ name: "list_customers", description: "List Stripe customers" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serviceKeyServer("stripe", mockServer.url, wrongKey)],
    });
    const { credentialResolver } = createCredentialServices();
    const logger = createCapturingLogger();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      logger,
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      logger,
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const tools = await withStubAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      assert.equal(connectionManager.get("stripe")?.state, "failed");
      assert.deepEqual(tools, []);
      assert.equal(logger.logs.length, 1);
      assert.equal(logger.logs[0]?.event, "connection.failed");
      assert.equal(logger.logs[0]?.fields.server, "stripe");
      const serialized = JSON.stringify(logger.logs);
      assert.doesNotMatch(serialized, new RegExp(wrongKey));
      assert.doesNotMatch(serialized, /Bearer/);
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });
});

const stripeKey = process.env.STRIPE_RESTRICTED_KEY;

describe("service_key credentials with Stripe MCP", () => {
  it("lists tools from Stripe when STRIPE_RESTRICTED_KEY is set", async (t) => {
    if (!stripeKey) {
      t.skip("STRIPE_RESTRICTED_KEY is not set");
      return;
    }

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          name: "stripe",
          transport: { type: "http", url: "https://mcp.stripe.com" },
          credential: {
            strategy: "service_key",
            key: stripeKey,
          },
          policy: { default: "deny", allow: ["list_customers"] },
        },
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const logger = createCapturingLogger();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      logger,
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      logger,
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const tools = await withStubAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      assert.ok(tools.length > 0);
      assert.ok(tools.some((tool) => tool.name.startsWith("stripe.")));
      assert.doesNotMatch(JSON.stringify(logger.logs), new RegExp(stripeKey));
    } finally {
      await closeManagerConnections(connectionManager);
    }
  });
});
