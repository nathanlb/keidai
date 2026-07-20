import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPROVAL_DECIDED_NOTIFICATION_METHOD,
  APPROVAL_REQUIRED_STATUS,
  type ApprovalDecidedNotificationParams,
} from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { createCredentialServices, withStubAgentPrincipal } from "../../credentials/tests/test-helpers.js";
import { createTestGatewayHttpServer } from "../../http/tests/test-helpers.js";
import type { GatewayHttpServerHandle } from "../../http/types/gateway-http-server.js";
import {
  connectAgentToGateway,
  TEST_AGENT_BEARER,
} from "../../identity/tests/test-helpers.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import {
  createApprovalServices,
  createPolicyEnforcement,
  type ApprovalServices,
} from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { McpSessionRegistry } from "../mcp-session-registry.service.js";

function parseApprovalRequired(result: unknown): { approval_id: string } {
  const content = (result as { content?: Array<{ type: string; text?: string }> })
    .content;
  const textPart = content?.find((part) => part.type === "text");
  const payload = JSON.parse(
    textPart && "text" in textPart ? textPart.text ?? "{}" : "{}",
  ) as { status?: string; approval_id?: string };
  assert.equal(payload.status, APPROVAL_REQUIRED_STATUS);
  assert.equal(typeof payload.approval_id, "string");
  return { approval_id: payload.approval_id! };
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

async function waitForNotification(
  notifications: ApprovalDecidedNotificationParams[],
  approvalId: string,
  timeoutMs = 5_000,
): Promise<ApprovalDecidedNotificationParams> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const match = notifications.find(
      (notification) => notification.approval_id === approvalId,
    );
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for approval notification ${approvalId}`);
}

async function withGatedGateway(
  run: (ctx: {
    gateway: GatewayHttpServerHandle;
    approvalServices: ApprovalServices;
  }) => Promise<void>,
): Promise<void> {
  const backend = await startMockMcpServer({
    tools: [{ name: "create_draft", description: "Create a draft email" }],
  });

  const configService = new ToriiConfigService({
    oauth_providers: {},
    agents: [
      {
        subject: {
          kind: "k8s_service_account",
          namespace: "torii-agents",
          service_account: "demo",
        },
        agent_id: STUB_AGENT_PRINCIPAL.agentId,
        owner_id: STUB_AGENT_PRINCIPAL.ownerId,
        groups: [],
        gated_tools: ["gmail.create_draft"],
      },
    ],
    servers: [
      {
        name: "gmail",
        transport: { type: "http", url: backend.url },
        credential: { strategy: "none" },
        policy: { default: "deny", allow: ["create_draft"] },
      },
    ],
  });
  const sessionRegistry = new McpSessionRegistry();
  const approvalServices = createApprovalServices(configService, sessionRegistry);
  const { credentialResolver } = createCredentialServices();
  const connectionManager = new ConnectionManager(
    configService,
    new DefaultMcpClientConnector(credentialResolver),
    createNoopLogger(),
  );
  const toolCatalog = new ToolCatalogService(
    connectionManager,
    credentialResolver,
    createPolicyEnforcement(configService),
    createNoopLogger(),
  );
  const toolDispatch = new ToolDispatchService(
    toolCatalog,
    connectionManager,
    credentialResolver,
    new CapturingTraceEmitter(),
    createPolicyEnforcement(configService),
    approvalServices.approvalGate,
  );
  const gatewayHttpServer = createTestGatewayHttpServer(
    toolCatalog,
    toolDispatch,
    { approvalServices, configService },
  );

  try {
    await withStubAgentPrincipal(async () => {
      await connectionManager.connectAll();
    });
    const gateway = await gatewayHttpServer.start();
    try {
      await run({ gateway, approvalServices });
    } finally {
      await gateway.close();
    }
  } finally {
    await closeManagerConnections(connectionManager);
    await backend.close();
  }
}

describe("Gateway MCP approval notifications", () => {
  it("pushes approval decisions over the stateful MCP session", async () => {
    await withGatedGateway(async ({ gateway, approvalServices }) => {
      assert.equal(
        approvalServices.approvalGate.requiresApproval(
          STUB_AGENT_PRINCIPAL,
          "gmail.create_draft",
        ),
        true,
      );
      const agent = await connectAgentToGateway(gateway.url, TEST_AGENT_BEARER);
      const notifications: ApprovalDecidedNotificationParams[] = [];
      agent.client.fallbackNotificationHandler = async (notification) => {
        if (notification.method === APPROVAL_DECIDED_NOTIFICATION_METHOD) {
          notifications.push(
            notification.params as unknown as ApprovalDecidedNotificationParams,
          );
        }
      };

      try {
        await agent.client.listTools();

        const gatedResult = await agent.client.callTool({
          name: "gmail.create_draft",
          arguments: { subject: "Hello" },
        });
        const { approval_id: approvalId } = parseApprovalRequired(gatedResult);

        const approveResponse = await fetch(
          `${gateway.baseUrl}/api/approvals/${approvalId}/approve`,
          { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
        );
        assert.equal(approveResponse.status, 200);

        const notification = await waitForNotification(notifications, approvalId);
        assert.equal(notification.status, "approved");

        const replayResult = await agent.client.callTool({
          name: "gmail.create_draft",
          arguments: {
            subject: "Hello",
            approval_id: approvalId,
          },
        });
        assert.notEqual(replayResult.isError, true);
      } finally {
        await agent.close();
      }
    });
  });

  it("pushes rejection decisions over the stateful MCP session", async () => {
    await withGatedGateway(async ({ gateway }) => {
      const agent = await connectAgentToGateway(gateway.url, TEST_AGENT_BEARER);
      const notifications: ApprovalDecidedNotificationParams[] = [];
      agent.client.fallbackNotificationHandler = async (notification) => {
        if (notification.method === APPROVAL_DECIDED_NOTIFICATION_METHOD) {
          notifications.push(
            notification.params as unknown as ApprovalDecidedNotificationParams,
          );
        }
      };

      try {
        await agent.client.listTools();

        const gatedResult = await agent.client.callTool({
          name: "gmail.create_draft",
          arguments: { subject: "Reject me" },
        });
        const { approval_id: approvalId } = parseApprovalRequired(gatedResult);

        const rejectResponse = await fetch(
          `${gateway.baseUrl}/api/approvals/${approvalId}/reject`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: "not allowed" }),
          },
        );
        assert.equal(rejectResponse.status, 200);

        const notification = await waitForNotification(notifications, approvalId);
        assert.deepEqual(notification, {
          approval_id: approvalId,
          status: "rejected",
          reason: "not allowed",
        });
      } finally {
        await agent.close();
      }
    });
  });

  it("pushes cancel decisions over the stateful MCP session", async () => {
    await withGatedGateway(async ({ gateway }) => {
      const agent = await connectAgentToGateway(gateway.url, TEST_AGENT_BEARER);
      const notifications: ApprovalDecidedNotificationParams[] = [];
      agent.client.fallbackNotificationHandler = async (notification) => {
        if (notification.method === APPROVAL_DECIDED_NOTIFICATION_METHOD) {
          notifications.push(
            notification.params as unknown as ApprovalDecidedNotificationParams,
          );
        }
      };

      try {
        await agent.client.listTools();

        const gatedResult = await agent.client.callTool({
          name: "gmail.create_draft",
          arguments: { subject: "Cancel me" },
        });
        const { approval_id: approvalId } = parseApprovalRequired(gatedResult);

        const cancelResponse = await fetch(
          `${gateway.baseUrl}/api/approvals/${approvalId}/cancel`,
          { method: "POST" },
        );
        assert.equal(cancelResponse.status, 200);

        const notification = await waitForNotification(notifications, approvalId);
        assert.equal(notification.status, "cancelled");
        assert.equal(notification.approval_id, approvalId);
      } finally {
        await agent.close();
      }
    });
  });

  it("rejects GET /mcp without a valid session id", async () => {
    const backend = await startMockMcpServer({
      tools: [{ name: "create_draft", description: "Create a draft email" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      agents: [],
      servers: [
        {
          name: "gmail",
          transport: { type: "http", url: backend.url },
          credential: { strategy: "none" },
          policy: { default: "deny", allow: ["create_draft"] },
        },
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );
    const toolCatalog = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      createNoopLogger(),
    );
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      new CapturingTraceEmitter(),
      createPolicyEnforcement(configService),
      createApprovalServices(configService).approvalGate,
    );
    const gatewayHttpServer = createTestGatewayHttpServer(
      toolCatalog,
      toolDispatch,
    );

    try {
      await withStubAgentPrincipal(async () => {
        await connectionManager.connectAll();
      });
      const gateway = await gatewayHttpServer.start();

      try {
        const response = await fetch(gateway.mcpUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_AGENT_BEARER}`,
            Accept: "text/event-stream",
          },
        });
        assert.equal(response.status, 400);
      } finally {
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await backend.close();
    }
  });
});
