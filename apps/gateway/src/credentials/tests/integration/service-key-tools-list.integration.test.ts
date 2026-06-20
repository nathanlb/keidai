import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ConnectionManager } from "../../../backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../../backends/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../../backends/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { ToolCatalogService } from "../../../catalog/tool-catalog.service.js";
import { createCredentialServices } from "../test-helpers.js";
import { createPolicyEnforcement } from "../../../policy/tests/test-helpers.js";

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
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
    );

    const logs: string[] = [];
    const originalError = console.error;
    console.error = (message?: unknown) => {
      logs.push(String(message));
    };

    try {
      await connectionManager.connectAll();
      const tools = await catalogService.listToolsForAgent();

      assert.deepEqual(tools.map((tool) => tool.name), ["stripe.list_customers"]);
      for (const log of logs) {
        assert.doesNotMatch(log, new RegExp(secretKey));
        assert.doesNotMatch(log, /Bearer/);
      }
    } finally {
      console.error = originalError;
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
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
    );

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (message?: unknown) => {
      errors.push(String(message));
    };

    try {
      await connectionManager.connectAll();
      const tools = await catalogService.listToolsForAgent();

      assert.equal(connectionManager.get("stripe")?.state, "failed");
      assert.deepEqual(tools, []);
      assert.equal(errors.length, 1);
      assert.match(errors[0] ?? "", /Failed to connect to backend "stripe"/);
      assert.doesNotMatch(errors[0] ?? "", new RegExp(wrongKey));
      assert.doesNotMatch(errors[0] ?? "", /Bearer/);
    } finally {
      console.error = originalError;
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
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
    );

    const logs: string[] = [];
    const originalError = console.error;
    console.error = (message?: unknown) => {
      logs.push(String(message));
    };

    try {
      await connectionManager.connectAll();
      const tools = await catalogService.listToolsForAgent();

      assert.ok(tools.length > 0);
      assert.ok(tools.some((tool) => tool.name.startsWith("stripe.")));
      for (const log of logs) {
        assert.doesNotMatch(log, new RegExp(stripeKey));
      }
    } finally {
      console.error = originalError;
      await closeManagerConnections(connectionManager);
    }
  });
});
