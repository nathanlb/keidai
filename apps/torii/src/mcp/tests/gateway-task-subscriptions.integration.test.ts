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
  MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  MCP_SUBSCRIPTIONS_LISTEN_METHOD,
  MCP_SUBSCRIPTION_ID_META_KEY,
  MCP_TASKS_EXTENSION_ID,
  MCP_TASKS_NOTIFICATION_METHOD,
} from "@keidai/shared";
import { iterateSseJson } from "@keidai/shared/mcp-jsonrpc";
import type { ToriiConfig } from "@keidai/shared";
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
const LISTEN_ID = "listen-1";

function modernMeta(overrides: Record<string, unknown> = {}) {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
    [CLIENT_INFO_META_KEY]: { name: "subscription-test-agent", version: "1.0.0" },
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

async function withTasksGateway(
  run: (ctx: { mcpUrl: string; taskStore: TaskStoreService }) => Promise<void>,
  persistence?: TestGatewayPersistence,
): Promise<void> {
  const ownedPersistence = persistence === undefined;
  const gatewayPersistence =
    persistence ?? (await createTestGatewayPersistence("postgres"));
  assert.ok(gatewayPersistence.taskStore);
  const backend = await startMockMcpServer({
    tools: [{ name: "echo", description: "Echo input" }],
  });

  const configService = new ToriiConfigService({
    oauth_providers: {},
    servers: [serverConfig("github", backend.url)],
    groups: [testAgentsGroup([{ server: "github", tools: ["echo"] }])],
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
    (await createApprovalServices(configService, gatewayPersistence)).approvalGate,
    gatewayPersistence.taskStore!,
  );
  const gatewayHttpServer = await createTestGatewayHttpServer(
    toolCatalog,
    toolDispatch,
    { persistence: gatewayPersistence },
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

function postMcp(
  mcpUrl: string,
  body: {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
  },
  init: { signal?: AbortSignal } = {},
): Promise<Response> {
  const mcpName =
    typeof body.params?.name === "string"
      ? body.params.name
      : typeof body.params?.taskId === "string"
        ? body.params.taskId
        : undefined;

  return fetch(mcpUrl, {
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
    signal: init.signal,
  });
}

function waitUntil(check: () => boolean, timeoutMs = 3_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error("timed out waiting for subscription frame"));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

async function collectFrames(
  response: Response,
  signal: AbortSignal,
): Promise<{ frames: Record<string, unknown>[] }> {
  const frames: Record<string, unknown>[] = [];
  const run = (async () => {
    try {
      for await (const frame of iterateSseJson(response)) {
        if (signal.aborted) {
          return;
        }
        if (frame && typeof frame === "object" && !Array.isArray(frame)) {
          frames.push(frame as Record<string, unknown>);
        }
      }
    } catch {
      // Stream abort or gateway shutdown.
    }
  })();
  void run;
  return { frames };
}

describe("Gateway MCP task subscriptions", () => {
  it("rejects taskIds listen without the tasks extension", async () => {
    await withTasksGateway(async ({ mcpUrl, taskStore }) => {
      const created = await taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      const response = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: LISTEN_ID,
        method: MCP_SUBSCRIPTIONS_LISTEN_METHOD,
        params: {
          notifications: { taskIds: [created.taskId] },
          _meta: modernMeta(),
        },
      });
      assert.equal(response.status, 200);
      const json = (await response.json()) as {
        error?: { code?: number };
      };
      assert.equal(
        json.error?.code,
        ProtocolErrorCode.MissingRequiredClientCapability,
      );
    });
  });

  it("acks owned task IDs and pushes notifications/tasks on complete", async () => {
    await withTasksGateway(async ({ mcpUrl, taskStore }) => {
      const created = await taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      const foreign = await taskStore.createWorkingTask({
        agentId: "other-agent",
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });

      const abort = new AbortController();
      try {
      const response = await postMcp(
        mcpUrl,
        {
          jsonrpc: "2.0",
          id: LISTEN_ID,
          method: MCP_SUBSCRIPTIONS_LISTEN_METHOD,
          params: {
            notifications: { taskIds: [created.taskId, foreign.taskId] },
            _meta: tasksMeta(),
          },
        },
        { signal: abort.signal },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

      const { frames } = await collectFrames(response, abort.signal);
      await waitUntil(() =>
        frames.some((frame) => frame.method === MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD),
      );
      const ack = frames.find(
        (frame) => frame.method === MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
      )!;
      const ackParams = ack.params as {
        notifications?: { taskIds?: string[] };
        _meta?: Record<string, unknown>;
      };
      assert.deepEqual(ackParams.notifications?.taskIds, [created.taskId]);
      assert.equal(ackParams._meta?.[MCP_SUBSCRIPTION_ID_META_KEY], LISTEN_ID);

      const completedAt = Date.now();
      await taskStore.complete(created.taskId, {
        content: [{ type: "text", text: "approved" }],
        isError: false,
      });
      await waitUntil(() =>
        frames.some((frame) => frame.method === MCP_TASKS_NOTIFICATION_METHOD),
      );
      const latencyMs = Date.now() - completedAt;
      const notification = frames.find(
        (frame) => frame.method === MCP_TASKS_NOTIFICATION_METHOD,
      )!;
      const params = notification.params as {
        taskId?: string;
        status?: string;
        result?: unknown;
        _meta?: Record<string, unknown>;
      };
      assert.equal(params.taskId, created.taskId);
      assert.equal(params.status, "completed");
      assert.deepEqual(params.result, {
        content: [{ type: "text", text: "approved" }],
        isError: false,
      });
      assert.equal(params._meta?.[MCP_SUBSCRIPTION_ID_META_KEY], LISTEN_ID);
      assert.ok(
        latencyMs < 1_000,
        `expected push below poll interval, got ${latencyMs}ms`,
      );
      } finally {
        try {
          abort.abort();
        } catch {
          // Node fetch may surface AbortError from abort().
        }
      }
    });
  });

  it("still serves tasks/get after the listen stream is aborted", async () => {
    await withTasksGateway(async ({ mcpUrl, taskStore }) => {
      const created = await taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      const abort = new AbortController();
      const listen = await postMcp(
        mcpUrl,
        {
          jsonrpc: "2.0",
          id: LISTEN_ID,
          method: MCP_SUBSCRIPTIONS_LISTEN_METHOD,
          params: {
            notifications: { taskIds: [created.taskId] },
            _meta: tasksMeta(),
          },
        },
        { signal: abort.signal },
      );
      const { frames } = await collectFrames(listen, abort.signal);
      await waitUntil(() =>
        frames.some((frame) => frame.method === MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD),
      );
      try {
        abort.abort();
      } catch {
        // Node may surface AbortError from the aborted fetch.
      }

      await taskStore.complete(created.taskId, {
        content: [{ type: "text", text: "ok" }],
        isError: false,
      });

      const getResponse = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "get-1",
        method: "tasks/get",
        params: { taskId: created.taskId, _meta: tasksMeta() },
      });
      const json = (await getResponse.json()) as {
        result?: { status?: string };
      };
      assert.equal(json.result?.status, "completed");
    });
  });

  it("delivers a decision that landed on another replica", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      await withTasksGateway(async ({ mcpUrl: subscriberUrl }) => {
        await withTasksGateway(async ({ taskStore }) => {
          const created = await taskStore.createWorkingTask({
            agentId: TEST_AGENT_PRINCIPAL.agentId,
            ownerId: TEST_AGENT_PRINCIPAL.ownerId,
          });
          const abort = new AbortController();
          try {
          const response = await postMcp(
            subscriberUrl,
            {
              jsonrpc: "2.0",
              id: LISTEN_ID,
              method: MCP_SUBSCRIPTIONS_LISTEN_METHOD,
              params: {
                notifications: { taskIds: [created.taskId] },
                _meta: tasksMeta(),
              },
            },
            { signal: abort.signal },
          );
          const { frames } = await collectFrames(response, abort.signal);
          await waitUntil(() =>
            frames.some(
              (frame) => frame.method === MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
            ),
          );

          await taskStore.complete(created.taskId, {
            content: [{ type: "text", text: "other-replica" }],
            isError: false,
          });

          await waitUntil(() =>
            frames.some((frame) => frame.method === MCP_TASKS_NOTIFICATION_METHOD),
          );
          const notification = frames.find(
            (frame) => frame.method === MCP_TASKS_NOTIFICATION_METHOD,
          )!;
          const params = notification.params as {
            status?: string;
            result?: { content?: Array<{ text?: string }> };
          };
          assert.equal(params.status, "completed");
          assert.equal(params.result?.content?.[0]?.text, "other-replica");
          } finally {
            try {
              abort.abort();
            } catch {
              // Node fetch may surface AbortError from abort().
            }
          }
        }, persistence);
      }, persistence);
    } finally {
      await persistence.close();
    }
  });
});
