import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  ProtocolErrorCode,
} from "@modelcontextprotocol/server";
import {
  MCP_TASKS_EXTENSION_ID,
  type ToriiConfig,
} from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { createTestGatewayHttpServer } from "../../http/tests/test-helpers.js";
import { TEST_AGENT_BEARER } from "../../identity/tests/test-helpers.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import {
  createPolicyEnforcement,
  createApprovalServices,
} from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { testAgentsGroup } from "../../testing/test-config.js";
import {
  createTestGatewayPersistence,
  type TestGatewayPersistence,
} from "../../testing/gateway-persistence.js";
import type { TaskStoreService } from "../../tasks/task-store.service.js";

const MODERN_PROTOCOL_VERSION = "2026-07-28";

function serverConfig(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
  };
}

function modernMeta(overrides: Record<string, unknown> = {}) {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
    [CLIENT_INFO_META_KEY]: { name: "tasks-test-agent", version: "1.0.0" },
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

async function withTasksGateway(
  run: (ctx: { mcpUrl: string; taskStore: TaskStoreService }) => Promise<void>,
  persistence?: TestGatewayPersistence,
): Promise<void> {
  const ownedPersistence = persistence === undefined;
  const gatewayPersistence =
    persistence ?? await createTestGatewayPersistence("postgres");
  assert.ok(gatewayPersistence.taskStore);
  const backend = await startMockMcpServer({
    tools: [{ name: "echo", description: "Echo input" }],
  });

  const groups = [testAgentsGroup([{ server: "github", tools: ["echo"] }])];
  const configService = new ToriiConfigService({
    oauth_providers: {},
    servers: [serverConfig("github", backend.url)],
  });
  const approvalServices = await createApprovalServices(groups, gatewayPersistence);
  const policyEnforcement = createPolicyEnforcement(groups);
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
    gatewayPersistence.taskStore!,
  );
  const gatewayHttpServer = await createTestGatewayHttpServer(
    toolCatalog,
    toolDispatch,
    { persistence: gatewayPersistence, groups },
  );

  try {
    await connectionManager.connectAll();
    await toolCatalog.refresh();
    const gateway = await gatewayHttpServer.start();
    try {
      await run({
        mcpUrl: gateway.mcpUrl,
        taskStore: gatewayPersistence.taskStore!,
      });
    } finally {
      await gateway.close();
    }
  } finally {
    await closeManagerConnections(connectionManager);
    await backend.close();
    if (ownedPersistence) {
      await gatewayPersistence.close();
    }
  }
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

describe("Gateway MCP tasks extension", () => {
  it("does not return resultType task to a client that has not declared the extension", async () => {
    await withTasksGateway(async ({ mcpUrl, taskStore }) => {
      const created = await taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });

      const { json: getJson } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "get-no-cap",
        method: "tasks/get",
        params: { taskId: created.taskId, _meta: modernMeta() },
      });
      const getError = (getJson as { error?: { code?: number; resultType?: string } })
        .error;
      assert.equal(
        getError?.code,
        ProtocolErrorCode.MissingRequiredClientCapability,
      );
      assert.equal(
        (getJson as { result?: { resultType?: string } }).result?.resultType,
        undefined,
      );

      const { json: callJson } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "call-no-cap",
        method: "tools/call",
        params: {
          name: "github.echo",
          arguments: { query: "hi" },
          _meta: modernMeta(),
        },
      });
      const callResult = (callJson as { result?: { resultType?: string } })
        .result;
      assert.ok(callResult);
      assert.notEqual(callResult.resultType, "task");
    });
  });

  it("returns a DetailedTask from tasks/get after durable create", async () => {
    await withTasksGateway(async ({ mcpUrl, taskStore }) => {
      const created = await taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
        statusMessage: "Working",
      });

      const { status, json } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "get-1",
        method: "tasks/get",
        params: { taskId: created.taskId, _meta: tasksMeta() },
      });

      assert.equal(status, 200);
      const result = (json as { result?: Record<string, unknown> }).result;
      assert.ok(result);
      assert.equal(result.resultType, "complete");
      assert.equal(result.taskId, created.taskId);
      assert.equal(result.status, "working");
      assert.equal(result.statusMessage, "Working");
      assert.equal(typeof result.createdAt, "string");
      assert.equal(typeof result.lastUpdatedAt, "string");
      assert.equal(typeof result.ttlMs, "number");
      assert.equal(result.pollIntervalMs, 5000);
    });
  });

  it("rejects another principal's task ID without disclosing existence", async () => {
    await withTasksGateway(async ({ mcpUrl, taskStore }) => {
      const created = await taskStore.createWorkingTask({
        agentId: "other-agent",
        ownerId: "other-owner",
      });

      const { json: otherJson } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "get-other",
        method: "tasks/get",
        params: { taskId: created.taskId, _meta: tasksMeta() },
      });
      const { json: missingJson } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "get-missing",
        method: "tasks/get",
        params: { taskId: "0".repeat(64), _meta: tasksMeta() },
      });

      const otherError = (otherJson as { error?: { code?: number; message?: string } })
        .error;
      const missingError = (
        missingJson as { error?: { code?: number; message?: string } }
      ).error;
      assert.equal(otherError?.code, ProtocolErrorCode.InvalidParams);
      assert.equal(missingError?.code, ProtocolErrorCode.InvalidParams);
      assert.equal(otherError?.message, missingError?.message);
      assert.match(otherError?.message ?? "", /Task not found/);
    });
  });

  it("expires tasks per ttlMs", async () => {
    await withTasksGateway(async ({ mcpUrl, taskStore }) => {
      const created = await taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
        now: Date.now() - 100,
        ttlMs: 10,
      });

      const { json } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "get-expired",
        method: "tasks/get",
        params: { taskId: created.taskId, _meta: tasksMeta() },
      });
      const error = (json as { error?: { code?: number; message?: string } })
        .error;
      assert.equal(error?.code, ProtocolErrorCode.InvalidParams);
      assert.match(error?.message ?? "", /expired/i);
    });
  });

  it("acknowledges tasks/update and tasks/cancel", async () => {
    await withTasksGateway(async ({ mcpUrl, taskStore }) => {
      const created = await taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      await taskStore.requireInput(created.taskId, {
        name: { method: "elicitation/create", params: { message: "name?" } },
      });

      const { json: updateJson } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "update-1",
        method: "tasks/update",
        params: {
          taskId: created.taskId,
          inputResponses: { name: { action: "accept" } },
          _meta: tasksMeta(),
        },
      });
      assert.equal(
        (updateJson as { result?: { resultType?: string } }).result?.resultType,
        "complete",
      );
      assert.equal(
        (await taskStore.getDetailedTask(TEST_AGENT_PRINCIPAL.agentId, created.taskId))
          .status,
        "working",
      );

      const { json: cancelJson } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "cancel-1",
        method: "tasks/cancel",
        params: { taskId: created.taskId, _meta: tasksMeta() },
      });
      assert.equal(
        (cancelJson as { result?: { resultType?: string } }).result?.resultType,
        "complete",
      );
      assert.equal(
        (await taskStore.getDetailedTask(TEST_AGENT_PRINCIPAL.agentId, created.taskId))
          .status,
        "cancelled",
      );
    });
  });

  it("reads a task created against a shared database after a restart", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.taskStore);
    const created = await persistence.taskStore.createWorkingTask({
      agentId: TEST_AGENT_PRINCIPAL.agentId,
      ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      statusMessage: "survived",
    });

    try {
      await withTasksGateway(async ({ mcpUrl }) => {
        const { json } = await postMcp(mcpUrl, {
          jsonrpc: "2.0",
          id: "get-restart",
          method: "tasks/get",
          params: { taskId: created.taskId, _meta: tasksMeta() },
        });
        const result = (json as { result?: Record<string, unknown> }).result;
        assert.equal(result?.taskId, created.taskId);
        assert.equal(result?.statusMessage, "survived");
      }, persistence);
    } finally {
      await persistence.close();
    }
  });
});
