import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { MCP_TASKS_EXTENSION_ID } from "@keidai/shared";
import { MCP_PROTOCOL_VERSION } from "@keidai/shared/mcp-jsonrpc";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import type { MockJsonRpcMessage } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { createCredentialServices, withTestAgentPrincipal } from "../../credentials/tests/test-helpers.js";
import { createTestGatewayHttpServer } from "../../http/tests/test-helpers.js";
import {
  TEST_AGENT_BEARER,
  TEST_AGENT_PRINCIPAL,
} from "../../identity/tests/test-helpers.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import {
  createApprovalServices,
  createPolicyEnforcement,
} from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { testAgentsGroup } from "../../testing/test-config.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";

const BACKEND_TASK_ID = "backend-shared-id";
const BACKEND_TASK_TIMESTAMPS = {
  createdAt: "2026-08-16T12:00:00.000Z",
  lastUpdatedAt: "2026-08-16T12:00:00.000Z",
  ttlMs: 60_000,
  pollIntervalMs: 50,
} as const;

function tasksMeta() {
  return {
    [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
    [CLIENT_INFO_META_KEY]: { name: "backend-tasks-agent", version: "1.0.0" },
    [CLIENT_CAPABILITIES_META_KEY]: {
      extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
    },
  };
}

function backendTaskJsonRpc(message: MockJsonRpcMessage) {
  if (message.method === "tools/call") {
    return {
      resultType: "task",
      taskId: BACKEND_TASK_ID,
      status: "working",
      ...BACKEND_TASK_TIMESTAMPS,
    };
  }
  if (message.method === "tasks/get") {
    return {
      resultType: "complete",
      taskId: BACKEND_TASK_ID,
      status: "completed",
      ...BACKEND_TASK_TIMESTAMPS,
      result: { content: [{ type: "text", text: "backend-done" }] },
    };
  }
  if (message.method === "tasks/cancel") {
    return { resultType: "complete" };
  }
  return undefined;
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

async function postMcp(
  mcpUrl: string,
  body: {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
  },
): Promise<{ status: number; json: unknown }> {
  const mcpName =
    typeof body.params?.name === "string"
      ? body.params.name
      : typeof body.params?.taskId === "string"
        ? body.params.taskId
        : undefined;

  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_AGENT_BEARER}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "mcp-method": body.method,
      ...(mcpName ? { "mcp-name": mcpName } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json(),
  };
}

function jsonResult(json: unknown): Record<string, unknown> {
  const result = (json as { result?: Record<string, unknown> }).result;
  assert.ok(result);
  return result;
}

describe("Gateway backend-originated tasks", () => {
  it("returns one reminted task and completes it from the backend poll", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    const backend = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: backendTaskJsonRpc,
    });
    const groups = [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])];
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          name: "github",
          transport: { type: "http", url: backend.url },
          credential: { strategy: "none" },
        },
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );
    const policyEnforcement = createPolicyEnforcement(groups);
    const approvalServices = await createApprovalServices(groups, persistence);
    const toolCatalog = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      policyEnforcement,
      createNoopLogger(),
    );
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      new CapturingTraceEmitter(),
      policyEnforcement,
      approvalServices.approvalGate,
      persistence.taskStore!,
    );
    const gatewayHttpServer = await createTestGatewayHttpServer(
      toolCatalog,
      toolDispatch,
      { persistence, configService, groups },
    );

    try {
      await withTestAgentPrincipal(async () => {
        await connectionManager.connectAll();
        await toolCatalog.refresh();
      });
      const gateway = await gatewayHttpServer.start();
      try {
        const created = jsonResult(
          (
            await postMcp(gateway.mcpUrl, {
              jsonrpc: "2.0",
              id: "call-1",
              method: "tools/call",
              params: {
                name: "github.search_issues",
                arguments: {},
                _meta: tasksMeta(),
              },
            })
          ).json,
        );
        assert.equal(created.resultType, "task");
        assert.notEqual(created.taskId, BACKEND_TASK_ID);

        const polled = jsonResult(
          (
            await postMcp(gateway.mcpUrl, {
              jsonrpc: "2.0",
              id: "get-1",
              method: "tasks/get",
              params: { taskId: created.taskId, _meta: tasksMeta() },
            })
          ).json,
        );
        assert.equal(polled.taskId, created.taskId);
        assert.equal(polled.status, "completed");
        const text = (
          polled.result as { content?: Array<{ text?: string }> }
        ).content?.[0]?.text;
        assert.equal(text, "backend-done");
      } finally {
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await backend.close();
      await persistence.close();
    }
  });

  it("collapses a gated tool and a backend task into one terminal result", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    const backend = await startMockMcpServer({
      tools: [{ name: "create_draft", description: "Create a draft email" }],
      onJsonRpc: backendTaskJsonRpc,
    });
    const groups = [testAgentsGroup([{ server: "gmail", tools: ["create_draft"] }])];
    const gatedTools = {
      [TEST_AGENT_PRINCIPAL.agentId]: ["gmail.create_draft"],
    };
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          name: "gmail",
          transport: { type: "http", url: backend.url },
          credential: { strategy: "none" },
        },
      ],
    });
    const approvalServices = await createApprovalServices(groups, persistence, undefined, gatedTools);
    const policyEnforcement = createPolicyEnforcement(groups, gatedTools);
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );
    const toolCatalog = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      policyEnforcement,
      createNoopLogger(),
    );
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      new CapturingTraceEmitter(),
      policyEnforcement,
      approvalServices.approvalGate,
      approvalServices.taskStore,
    );
    const gatewayHttpServer = await createTestGatewayHttpServer(
      toolCatalog,
      toolDispatch,
      { persistence, approvalServices, configService, groups, gatedTools },
    );

    try {
      await withTestAgentPrincipal(async () => {
        await connectionManager.connectAll();
        await toolCatalog.refresh();
      });
      const gateway = await gatewayHttpServer.start();
      try {
        const created = jsonResult(
          (
            await postMcp(gateway.mcpUrl, {
              jsonrpc: "2.0",
              id: "call-gated",
              method: "tools/call",
              params: {
                name: "gmail.create_draft",
                arguments: { subject: "hi" },
                _meta: tasksMeta(),
              },
            })
          ).json,
        );
        assert.equal(created.resultType, "task");
        const gatewayTaskId = String(created.taskId);

        const listed = await fetch(`${gateway.baseUrl}/api/approvals?status=pending`);
        const pending = (await listed.json()) as Array<{ id: string }>;
        assert.equal(pending.length, 1);
        const approve = await fetch(
          `${gateway.baseUrl}/api/approvals/${pending[0]!.id}/approve`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          },
        );
        assert.equal(approve.status, 200);

        const polled = jsonResult(
          (
            await postMcp(gateway.mcpUrl, {
              jsonrpc: "2.0",
              id: "get-gated",
              method: "tasks/get",
              params: { taskId: gatewayTaskId, _meta: tasksMeta() },
            })
          ).json,
        );
        assert.equal(polled.taskId, gatewayTaskId);
        assert.notEqual(polled.taskId, BACKEND_TASK_ID);
        assert.equal(polled.status, "completed");
        const text = (
          polled.result as { content?: Array<{ text?: string }> }
        ).content?.[0]?.text;
        assert.equal(text, "backend-done");
      } finally {
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await backend.close();
      await persistence.close();
    }
  });
});
