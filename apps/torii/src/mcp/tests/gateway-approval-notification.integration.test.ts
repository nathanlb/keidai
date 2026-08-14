import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  ProtocolErrorCode,
} from "@modelcontextprotocol/server";
import { MCP_TASKS_EXTENSION_ID } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { createCredentialServices, withTestAgentPrincipal } from "../../credentials/tests/test-helpers.js";
import { createTestGatewayHttpServer } from "../../http/tests/test-helpers.js";
import type { GatewayHttpServerHandle } from "../../http/types/gateway-http-server.js";
import { TEST_AGENT_BEARER } from "../../identity/tests/test-helpers.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import {
  createApprovalServices,
  createPolicyEnforcement,
  type ApprovalServices,
} from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { testAgentsGroup } from "../../testing/test-config.js";
import {
  createTestGatewayPersistence,
  type TestGatewayPersistence,
} from "../../testing/gateway-persistence.js";
import { openGatewayDatabase } from "../../storage/gateway-sqlite.js";
import { ApprovalStoreService } from "../../policy/approval-store.service.js";
import { TaskStoreService } from "../../tasks/task-store.service.js";

const MODERN_PROTOCOL_VERSION = "2026-07-28";

function modernMeta(overrides: Record<string, unknown> = {}) {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
    [CLIENT_INFO_META_KEY]: { name: "approval-tasks-agent", version: "1.0.0" },
    [CLIENT_CAPABILITIES_META_KEY]: {},
    ...overrides,
  };
}

function tasksMeta() {
  return modernMeta({
    [CLIENT_CAPABILITIES_META_KEY]: {
      extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
    },
  });
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
      "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
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

async function withGatedGateway(
  run: (ctx: {
    gateway: GatewayHttpServerHandle;
    approvalServices: ApprovalServices;
    backendCallCount: () => number;
  }) => Promise<void>,
  persistence?: TestGatewayPersistence,
  options: { passPersistenceToHttp?: boolean } = {},
): Promise<void> {
  const ownedPersistence = persistence === undefined;
  const gatewayPersistence =
    persistence ?? createTestGatewayPersistence("sqlite");
  let backendCallCount = 0;
  const backend = await startMockMcpServer({
    tools: [
      {
        name: "create_draft",
        description: "Create a draft email",
        handler: async (input) => {
          backendCallCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { text: `drafted:${String(input.subject ?? "")}` };
        },
      },
    ],
  });

  const configService = new ToriiConfigService({
    oauth_providers: {},
    servers: [
      {
        name: "gmail",
        transport: { type: "http", url: backend.url },
        credential: { strategy: "none" },
      },
    ],
    groups: [testAgentsGroup([{ server: "gmail", tools: ["create_draft"] }])],
    gated_tools: {
      [TEST_AGENT_PRINCIPAL.agentId]: ["gmail.create_draft"],
    },
  });
  const approvalServices = createApprovalServices(
    configService,
    gatewayPersistence,
  );
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
    approvalServices.taskStore,
  );
  const gatewayHttpServer = createTestGatewayHttpServer(
    toolCatalog,
    toolDispatch,
    {
      approvalServices,
      configService,
      ...(options.passPersistenceToHttp === false
        ? {}
        : { persistence: gatewayPersistence }),
    },
  );

  try {
    await withTestAgentPrincipal(async () => {
      await connectionManager.connectAll();
      await toolCatalog.refresh();
    });
    const gateway = await gatewayHttpServer.start();
    try {
      await run({
        gateway,
        approvalServices,
        backendCallCount: () => backendCallCount,
      });
    } finally {
      await gateway.close();
    }
  } finally {
    await closeManagerConnections(connectionManager);
    await backend.close();
    if (ownedPersistence) {
      gatewayPersistence.close();
    }
  }
}

async function callGatedTool(
  mcpUrl: string,
  subject: string,
  id: string,
  meta: Record<string, unknown> = tasksMeta(),
): Promise<{ status: number; json: unknown }> {
  return postMcp(mcpUrl, {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "gmail.create_draft",
      arguments: { subject },
      _meta: meta,
    },
  });
}

async function getTask(
  mcpUrl: string,
  taskId: string,
  id: string,
): Promise<{ status: number; json: unknown }> {
  return postMcp(mcpUrl, {
    jsonrpc: "2.0",
    id,
    method: "tasks/get",
    params: { taskId, _meta: tasksMeta() },
  });
}

async function listPendingApprovalId(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/approvals?status=pending`);
  assert.equal(response.status, 200);
  const listed = (await response.json()) as Array<{ id: string }>;
  assert.equal(listed.length, 1);
  assert.equal(typeof listed[0]?.id, "string");
  return listed[0]!.id;
}

describe("Gateway MCP approval gate (tasks)", () => {
  it("returns resultType task for a gated tools/call and never approval_required", async () => {
    await withGatedGateway(async ({ gateway }) => {
      const { json } = await callGatedTool(gateway.mcpUrl, "Hello", "call-1");
      const result = jsonResult(json);
      assert.equal(result.resultType, "task");
      assert.equal(result.status, "working");
      assert.equal(typeof result.taskId, "string");
      assert.equal(typeof result.ttlMs, "number");
      assert.equal(typeof result.pollIntervalMs, "number");
      assert.equal(result.approval_id, undefined);
      assert.notEqual(result.status, "approval_required");
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes("approval_id"), false);
      assert.equal(serialized.includes("approval_required"), false);
    });
  });

  it("finds the parked task on tasks/get when the HTTP server is given only approvalServices (eval wiring)", async () => {
    await withGatedGateway(
      async ({ gateway }) => {
        const created = jsonResult(
          (await callGatedTool(gateway.mcpUrl, "Hello", "call-eval-wire")).json,
        );
        const taskId = String(created.taskId);
        const { json } = await getTask(gateway.mcpUrl, taskId, "get-eval-wire");
        const error = (json as { error?: { message?: string } }).error;
        assert.equal(
          error,
          undefined,
          error?.message ?? "expected tasks/get result",
        );
        const result = jsonResult(json);
        assert.equal(result.taskId, taskId);
        assert.equal(result.status, "working");
      },
      undefined,
      { passPersistenceToHttp: false },
    );
  });

  it("rejects a gated tools/call when the client has not declared the tasks extension", async () => {
    await withGatedGateway(async ({ gateway, approvalServices }) => {
      const { json } = await callGatedTool(
        gateway.mcpUrl,
        "Hello",
        "call-no-cap",
        modernMeta(),
      );
      const error = (json as { error?: { code?: number } }).error;
      assert.equal(
        error?.code,
        ProtocolErrorCode.MissingRequiredClientCapability,
      );
      assert.equal(approvalServices.approvalStore.listApprovals("pending").length, 0);
    });
  });

  it("executes an approved task on poll and completes with the backend CallToolResult", async () => {
    await withGatedGateway(async ({ gateway, backendCallCount }) => {
      const created = jsonResult(
        (await callGatedTool(gateway.mcpUrl, "Hello", "call-1")).json,
      );
      const taskId = String(created.taskId);
      const approvalId = await listPendingApprovalId(gateway.baseUrl);

      const approveResponse = await fetch(
        `${gateway.baseUrl}/api/approvals/${approvalId}/approve`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      );
      assert.equal(approveResponse.status, 200);

      const { json } = await getTask(gateway.mcpUrl, taskId, "get-1");
      const result = jsonResult(json);
      assert.equal(result.resultType, "complete");
      assert.equal(result.status, "completed");
      const toolResult = result.result as {
        content?: Array<{ type: string; text?: string }>;
      };
      const textPart = toolResult.content?.find((part) => part.type === "text");
      assert.match(textPart?.text ?? "", /drafted:Hello/);
      assert.equal(backendCallCount(), 1);
    });
  });

  it("completes a rejected task with the denial payload, not failed", async () => {
    await withGatedGateway(async ({ gateway, backendCallCount }) => {
      const created = jsonResult(
        (await callGatedTool(gateway.mcpUrl, "Reject me", "call-1")).json,
      );
      const taskId = String(created.taskId);
      const approvalId = await listPendingApprovalId(gateway.baseUrl);

      const rejectResponse = await fetch(
        `${gateway.baseUrl}/api/approvals/${approvalId}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "not allowed" }),
        },
      );
      assert.equal(rejectResponse.status, 200);

      const { json } = await getTask(gateway.mcpUrl, taskId, "get-1");
      const result = jsonResult(json);
      assert.equal(result.status, "completed");
      const toolResult = result.result as {
        structuredContent?: { status?: string; reason?: string };
        isError?: boolean;
      };
      assert.equal(toolResult.structuredContent?.status, "approval_denied");
      assert.equal(toolResult.structuredContent?.reason, "not allowed");
      assert.notEqual(result.status, "failed");
      assert.equal(backendCallCount(), 0);
    });
  });

  it("moves a cancelled approval's task to cancelled", async () => {
    await withGatedGateway(async ({ gateway, backendCallCount }) => {
      const created = jsonResult(
        (await callGatedTool(gateway.mcpUrl, "Cancel me", "call-1")).json,
      );
      const taskId = String(created.taskId);
      const approvalId = await listPendingApprovalId(gateway.baseUrl);

      const cancelResponse = await fetch(
        `${gateway.baseUrl}/api/approvals/${approvalId}/cancel`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      );
      assert.equal(cancelResponse.status, 200);

      const { json } = await getTask(gateway.mcpUrl, taskId, "get-1");
      assert.equal(jsonResult(json).status, "cancelled");
      assert.equal(backendCallCount(), 0);
    });
  });

  it("executes an approved task exactly once under concurrent polls", async () => {
    await withGatedGateway(async ({ gateway, backendCallCount }) => {
      const created = jsonResult(
        (await callGatedTool(gateway.mcpUrl, "Once", "call-1")).json,
      );
      const taskId = String(created.taskId);
      const approvalId = await listPendingApprovalId(gateway.baseUrl);
      const approveResponse = await fetch(
        `${gateway.baseUrl}/api/approvals/${approvalId}/approve`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      );
      assert.equal(approveResponse.status, 200);

      const polls = await Promise.all([
        getTask(gateway.mcpUrl, taskId, "get-a"),
        getTask(gateway.mcpUrl, taskId, "get-b"),
        getTask(gateway.mcpUrl, taskId, "get-c"),
      ]);
      assert.equal(backendCallCount(), 1);

      const drain = jsonResult((await getTask(gateway.mcpUrl, taskId, "get-drain")).json);
      assert.equal(drain.status, "completed");
      for (const poll of polls) {
        const status = jsonResult(poll.json).status;
        assert.ok(status === "working" || status === "completed");
      }
    });
  });

  it("creates on one replica, approves on a second, and polls from a third", async () => {
    const persistence = createTestGatewayPersistence("sqlite");
    assert.ok(persistence.databasePath);
    let taskId = "";
    let approvalId = "";

    try {
      await withGatedGateway(async ({ gateway }) => {
        const created = jsonResult(
          (await callGatedTool(gateway.mcpUrl, "Replica", "call-1")).json,
        );
        taskId = String(created.taskId);
        approvalId = await listPendingApprovalId(gateway.baseUrl);
      }, persistence);

      const approveDb = openGatewayDatabase(persistence.databasePath);
      try {
        const approved = new ApprovalStoreService(approveDb).approve(approvalId);
        assert.equal(approved?.status, "approved");
      } finally {
        approveDb.close();
      }

      await withGatedGateway(async ({ gateway, backendCallCount }) => {
        const { json } = await getTask(gateway.mcpUrl, taskId, "get-replica");
        const result = jsonResult(json);
        assert.equal(result.status, "completed");
        const toolResult = result.result as {
          content?: Array<{ type: string; text?: string }>;
        };
        const textPart = toolResult.content?.find((part) => part.type === "text");
        assert.match(textPart?.text ?? "", /drafted:Replica/);
        assert.equal(backendCallCount(), 1);
        assert.ok(new TaskStoreService(persistence.database!).getDetailedTask(
          TEST_AGENT_PRINCIPAL.agentId,
          taskId,
        ));
      }, persistence);
    } finally {
      persistence.close();
    }
  });

  it("does not expose GET /mcp (session stream removed)", async () => {
    await withGatedGateway(async ({ gateway }) => {
      const response = await fetch(gateway.mcpUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_AGENT_BEARER}`,
          Accept: "text/event-stream",
        },
      });
      assert.equal(response.status, 404);
    });
  });
});
