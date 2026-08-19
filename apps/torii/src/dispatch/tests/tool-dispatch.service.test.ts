import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { PolicyDecision, TORII_RUN_ID_ARG, TORII_STEP_ID_ARG, TORII_CALL_META_KEY } from "@keidai/shared";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import type { MockJsonRpcMessage } from "../../connections/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { createCredentialServices, bootBackends, withTestAgentPrincipal } from "../../credentials/tests/test-helpers.js";
import { LINKING_REQUIRED_CODE } from "../../credentials/types/credential-resolution.js";
import { runWithAgentPrincipal } from "../../identity/agent-principal-context.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import type { CapturingTraceEmitter as CapturingTraceEmitterType } from "../../trace/tests/capturing-trace-emitter.js";
import { PolicyDeniedError } from "../../policy/types/policy-denied.js";
import { createPolicyEnforcement, createApprovalServices } from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { testAgentsGroup } from "../../testing/test-config.js";
import { ToolDispatchService } from "../tool-dispatch.service.js";
import { isParkedTaskResult } from "../utils/is-parked-task-result.js";
import {
  BACKEND_INPUT_REQUIRED_MESSAGE,
  unrecognizedBackendResultTypeMessage,
} from "../utils/classify-backend-tool-result.js";
import {
  BackendUnavailableError,
  ToolNotFoundError,
} from "../types/tool-dispatch.js";

function expectCallToolResult(
  result: Awaited<ReturnType<ToolDispatchService["callTool"]>>,
) {
  assert.equal(isParkedTaskResult(result), false);
  if (isParkedTaskResult(result)) {
    assert.fail("expected a CallToolResult, not a parked task");
  }
  return result;
}

function noneServer(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
  };
}

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
  };
}

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

async function createDispatchStack(
  servers: ToriiConfig["servers"][number][],
  groups: ToriiConfig["groups"] = [],
): Promise<{
  connectionManager: ConnectionManager;
  toolCatalog: ToolCatalogService;
  toolDispatch: ToolDispatchService;
  traceEmitter: CapturingTraceEmitterType;
  taskStore: Awaited<ReturnType<typeof createApprovalServices>>["taskStore"];
  close: () => Promise<void>;
}> {
  const { credentialResolver } = createCredentialServices();

  const configService = new ToriiConfigService({
    oauth_providers: {
      github: {
        token_url: "https://github.com/login/oauth/access_token",
        client_id: "client",
        client_secret: "secret",
        scopes: ["repo"],
      },
    },
    servers,
    groups,
  });
  const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
  const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
  const traceEmitter = new CapturingTraceEmitter();
  const services = await createApprovalServices(configService);
  const { approvalGate, taskStore } = services;
  const toolDispatch = new ToolDispatchService(
    toolCatalog,
    connectionManager,
    credentialResolver,
    traceEmitter,
    createPolicyEnforcement(configService),
    approvalGate,
    taskStore,
  );

  return {
    connectionManager,
    toolCatalog,
    toolDispatch,
    traceEmitter,
    taskStore,
    close: async () => {
      await closeManagerConnections(connectionManager);
      await services.close();
    },
  };
}

const BACKEND_TASK_TIMESTAMPS = {
  createdAt: "2026-08-16T12:00:00.000Z",
  lastUpdatedAt: "2026-08-16T12:00:00.000Z",
  ttlMs: 60_000,
  pollIntervalMs: 50,
} as const;

interface BackendTaskStub {
  onJsonRpc: (message: MockJsonRpcMessage) => Record<string, unknown> | undefined;
  /** Every `tasks/*` request the backend received, in order. */
  taskCalls: Array<{ method: string; taskId?: unknown }>;
}

/** A backend whose `tools/call` parks a task and whose `tasks/get` answers `getStatus`. */
function backendTaskStub(
  backendTaskId: string,
  getStatus: {
    status: "working" | "completed" | "failed" | "cancelled" | "input_required";
    result?: Record<string, unknown>;
    error?: Record<string, unknown>;
    inputRequests?: Record<string, unknown>;
    /** Break the `tasks/get` contract to exercise the unrecognised path. */
    malformed?: boolean;
  },
): BackendTaskStub {
  const taskCalls: BackendTaskStub["taskCalls"] = [];

  return {
    taskCalls,
    onJsonRpc: (message) => {
      if (message.method?.startsWith("tasks/")) {
        taskCalls.push({
          method: message.method,
          taskId: message.params?.taskId,
        });
      }
      if (message.method === "tools/call") {
        return {
          resultType: "task",
          taskId: backendTaskId,
          status: "working",
          ...BACKEND_TASK_TIMESTAMPS,
        };
      }
      if (message.method === "tasks/get") {
        if (getStatus.malformed) {
          return { resultType: "stream" };
        }
        return {
          resultType: "complete",
          taskId: backendTaskId,
          status: getStatus.status,
          ...BACKEND_TASK_TIMESTAMPS,
          ...(getStatus.result ? { result: getStatus.result } : {}),
          ...(getStatus.error ? { error: getStatus.error } : {}),
          ...(getStatus.inputRequests
            ? { inputRequests: getStatus.inputRequests }
            : {}),
        };
      }
      if (message.method === "tasks/cancel") {
        return { resultType: "complete" };
      }
      return undefined;
    },
  };
}

function cancelledBackendTaskIds(stub: BackendTaskStub): unknown[] {
  return stub.taskCalls
    .filter((call) => call.method === "tasks/cancel")
    .map((call) => call.taskId);
}

function formatBackendToolErrorForTest(result: {
  content?: Array<{ type: string; text?: string }>;
}): string {
  return (result.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

describe("ToolDispatchService", () => {
  it("routes a namespaced call to the backend bare tool name", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });
    const stack = await createDispatchStack(
      [noneServer("deepwiki", mockServer.url)],
      [testAgentsGroup([{ server: "deepwiki", tools: ["read_wiki_structure"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const result = expectCallToolResult(
        await withTestAgentPrincipal(() =>
          stack.toolDispatch.callTool("deepwiki.read_wiki_structure", {}),
        ),
      );

      assert.notEqual(result.isError, true);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("rejects unknown tools that are allowed by policy but absent from the catalog", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
    });
    const stack = await createDispatchStack(
      [
        {
          ...noneServer("github", mockServer.url),
        },
      ],
      [
        testAgentsGroup([
          { server: "github", tools: ["search_issues", "missing_tool"] },
        ]),
      ],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      await withTestAgentPrincipal(() =>
        assert.rejects(
          () => stack.toolDispatch.callTool("github.missing_tool", {}),
          ToolNotFoundError,
        ),
      );
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("denies policy-blocked tools without forwarding to the backend", async () => {
    const mockServer = await startMockMcpServer({
      tools: [
        { name: "search_issues", description: "Search issues" },
        { name: "merge_pull_request", description: "Merge a pull request" },
      ],
    });
    const stack = await createDispatchStack(
      [userOAuthServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await withTestAgentPrincipal(async () => {
        await stack.connectionManager.connectAll();
        await stack.toolCatalog.refresh();

        await assert.rejects(
          () => stack.toolDispatch.callTool("github.merge_pull_request", {}),
          PolicyDeniedError,
        );

        assert.equal(stack.traceEmitter.traces.length, 1);
        const trace = stack.traceEmitter.traces[0]!;
        assert.equal(trace.policyDecision, PolicyDecision.Denied);
        assert.equal(trace.error, "policy denied");
        assert.equal(trace.durationMs, undefined);
      });
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("surfaces unknown_group denials on the call trace", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
    });
    const stack = await createDispatchStack(
      [userOAuthServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await runWithAgentPrincipal(
        { ...TEST_AGENT_PRINCIPAL, groups: ["ops"] },
        async () => {
          await stack.connectionManager.connectAll();
          await stack.toolCatalog.refresh();

          await assert.rejects(
            () => stack.toolDispatch.callTool("github.search_issues", {}),
            PolicyDeniedError,
          );

          assert.equal(stack.traceEmitter.traces.length, 1);
          const trace = stack.traceEmitter.traces[0]!;
          assert.equal(trace.policyDecision, PolicyDecision.Denied);
          assert.equal(trace.error, "unknown_group: ops");
        },
      );
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("emits a structured trace for allowed calls", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });
    const stack = await createDispatchStack(
      [noneServer("deepwiki", mockServer.url)],
      [testAgentsGroup([{ server: "deepwiki", tools: ["read_wiki_structure"] }])],
    );

    try {
      await withTestAgentPrincipal(async () => {
        await stack.connectionManager.connectAll();
        await stack.toolCatalog.refresh();

        await stack.toolDispatch.callTool("deepwiki.read_wiki_structure", {});

        assert.equal(stack.traceEmitter.traces.length, 1);
        const trace = stack.traceEmitter.traces[0]!;
        assert.equal(trace.server, "deepwiki");
        assert.equal(trace.tool, "read_wiki_structure");
        assert.equal(trace.policyDecision, PolicyDecision.Allowed);
        assert.equal(typeof trace.durationMs, "number");
        assert.deepEqual(trace.principal, {
          agentId: TEST_AGENT_PRINCIPAL.agentId,
          ownerId: TEST_AGENT_PRINCIPAL.ownerId,
          bearerId: TEST_AGENT_PRINCIPAL.bearerId,
        });
        assert.equal(trace.credentialRef, "none");
        assert.doesNotMatch(JSON.stringify(trace), /Bearer/);
      });
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("emits an errored trace when the backend is unavailable", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
    });
    const stack = await createDispatchStack(
      [
        {
          name: "github",
          transport: { type: "http", url: mockServer.url },
          credential: { strategy: "none" },
        },
      ],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      // Kill the upstream so ensureConnected/reconnect cannot recover.
      await mockServer.close();
      const connection = stack.connectionManager.get("github");
      assert.ok(connection);
      connection.state = "failed";
      connection.client = null;
      connection.error = new Error("connection lost");

      await withTestAgentPrincipal(() =>
        assert.rejects(
          () => stack.toolDispatch.callTool("github.search_issues", {}),
          BackendUnavailableError,
        ),
      );

      assert.equal(stack.traceEmitter.traces.length, 1);
      const trace = stack.traceEmitter.traces[0]!;
      assert.equal(trace.policyDecision, PolicyDecision.Allowed);
      assert.equal(trace.durationMs, undefined);
      assert.match(trace.error ?? "", /unavailable/);
    } finally {
      await stack.close();
    }
  });

  it("returns linking_required when user_oauth credentials are missing", async () => {
    const mockServer = await startMockMcpServer({
      requireAuth: true,
      tools: [{ name: "search_issues", description: "Search issues" }],
    });
    const oauthProviders = {
      github: {
        token_url: "https://github.com/login/oauth/access_token",
        client_id: "client",
        client_secret: "secret",
        scopes: ["repo"],
      },
    };
    const { tokenRepository, credentialResolver } = createCredentialServices({
      oauth_providers: oauthProviders,
    });
    const configService = new ToriiConfigService({
      oauth_providers: oauthProviders,
      servers: [userOAuthServer("github", mockServer.url)],
      groups: [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    });
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
    const traceEmitter = new CapturingTraceEmitter();
    const { approvalGate, taskStore } = await createApprovalServices(configService);
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      traceEmitter,
      createPolicyEnforcement(configService),
      approvalGate,
      taskStore,
    );

    try {
      await withTestAgentPrincipal(async () => {
        await tokenRepository.set(TEST_AGENT_PRINCIPAL.ownerId, "github", {
          accessToken: "gho_valid",
        });
        await connectionManager.connectAll();
        await toolCatalog.refresh();
        await tokenRepository.set(TEST_AGENT_PRINCIPAL.ownerId, "github", {
          accessToken: "gho_valid",
          expiresAt: new Date(0),
        });

        const result = expectCallToolResult(
          await toolDispatch.callTool("github.search_issues", {}),
        );

        assert.equal(result.isError, true);
        const structuredContent = result.structuredContent as
          | Record<string, unknown>
          | undefined;
        assert.deepEqual(structuredContent, {
          code: LINKING_REQUIRED_CODE,
          provider: "github",
          ownerId: TEST_AGENT_PRINCIPAL.ownerId,
          backend: "github",
          linkUrl: structuredContent?.linkUrl,
        });
        assert.match(String(structuredContent?.linkUrl), /client_id=client/);
        assert.doesNotMatch(JSON.stringify(result), /gho_valid/);
      });
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });

  it("calls stripe with service_key credentials", async () => {
    const secretKey = "sk_test_secret_key";
    const mockServer = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: secretKey,
      tools: [{ name: "list_customers", description: "List customers" }],
    });
    const stack = await createDispatchStack(
      [serviceKeyServer("stripe", mockServer.url, secretKey)],
      [testAgentsGroup([{ server: "stripe", tools: ["list_customers"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const result = expectCallToolResult(
        await withTestAgentPrincipal(() =>
          stack.toolDispatch.callTool("stripe.list_customers", {}),
        ),
      );

      assert.notEqual(result.isError, true);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("returns traceId in MCP _meta and persists run/step correlation", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });
    const stack = await createDispatchStack(
      [noneServer("deepwiki", mockServer.url)],
      [testAgentsGroup([{ server: "deepwiki", tools: ["read_wiki_structure"] }])],
    );

    try {
      await withTestAgentPrincipal(async () => {
        await stack.connectionManager.connectAll();
        await stack.toolCatalog.refresh();

        const result = expectCallToolResult(
          await stack.toolDispatch.callTool(
            "deepwiki.read_wiki_structure",
            {
              [TORII_RUN_ID_ARG]: "run-123",
              [TORII_STEP_ID_ARG]: "step-456",
            },
          ),
        );

        assert.equal(stack.traceEmitter.traces.length, 1);
        const trace = stack.traceEmitter.traces[0]!;
        assert.equal(trace.runId, "run-123");
        assert.equal(trace.stepId, "step-456");
        assert.deepEqual(result._meta?.[TORII_CALL_META_KEY], {
          traceId: trace.traceId,
        });
      });
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("omits run/step correlation when meta args are absent", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });
    const stack = await createDispatchStack(
      [noneServer("deepwiki", mockServer.url)],
      [testAgentsGroup([{ server: "deepwiki", tools: ["read_wiki_structure"] }])],
    );

    try {
      await withTestAgentPrincipal(async () => {
        await stack.connectionManager.connectAll();
        await stack.toolCatalog.refresh();

        const result = expectCallToolResult(
          await stack.toolDispatch.callTool(
            "deepwiki.read_wiki_structure",
            {},
          ),
        );

        const trace = stack.traceEmitter.traces[0]!;
        assert.equal(trace.runId, undefined);
        assert.equal(trace.stepId, undefined);
        assert.deepEqual(result._meta?.[TORII_CALL_META_KEY], {
          traceId: trace.traceId,
        });
      });
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("remints a backend CreateTaskResult onto a gateway task id", async () => {
    const backendTaskId = "shared-backend-id";
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: backendTaskStub(backendTaskId, { status: "working" }).onJsonRpc,
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const result = await withTestAgentPrincipal(() =>
        stack.toolDispatch.callTool(
          "github.search_issues",
          {},
          { clientDeclaresTasks: true },
        ),
      );

      assert.equal(isParkedTaskResult(result), true);
      if (!isParkedTaskResult(result)) {
        assert.fail("expected a parked task");
      }
      assert.equal(result.resultType, "task");
      assert.notEqual(result.taskId, backendTaskId);
      assert.match(result.taskId, /^[0-9a-f]{64}$/);

      const trace = stack.traceEmitter.traces[0]!;
      assert.equal(trace.taskId, result.taskId);
      assert.equal(trace.backendTaskId, backendTaskId);
      assert.equal(trace.error, undefined);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("keeps task ids from two backends from colliding", async () => {
    const sharedId = "same-id";
    const alpha = await startMockMcpServer({
      tools: [{ name: "echo", description: "Echo" }],
      onJsonRpc: backendTaskStub(sharedId, { status: "working" }).onJsonRpc,
    });
    const beta = await startMockMcpServer({
      tools: [{ name: "echo", description: "Echo" }],
      onJsonRpc: backendTaskStub(sharedId, { status: "working" }).onJsonRpc,
    });
    const stack = await createDispatchStack(
      [noneServer("alpha", alpha.url), noneServer("beta", beta.url)],
      [
        testAgentsGroup([
          { server: "alpha", tools: ["echo"] },
          { server: "beta", tools: ["echo"] },
        ]),
      ],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const [first, second] = await withTestAgentPrincipal(async () => [
        await stack.toolDispatch.callTool(
          "alpha.echo",
          {},
          { clientDeclaresTasks: true },
        ),
        await stack.toolDispatch.callTool(
          "beta.echo",
          {},
          { clientDeclaresTasks: true },
        ),
      ]);

      assert.equal(isParkedTaskResult(first), true);
      assert.equal(isParkedTaskResult(second), true);
      if (!isParkedTaskResult(first) || !isParkedTaskResult(second)) {
        assert.fail("expected parked tasks");
      }
      assert.equal(first.taskId === second.taskId, false);
      assert.equal(stack.traceEmitter.traces[0]?.backendTaskId, sharedId);
      assert.equal(stack.traceEmitter.traces[1]?.backendTaskId, sharedId);
    } finally {
      await stack.close();
      await alpha.close();
      await beta.close();
    }
  });

  it("cancels the backend task when the client omitted the tasks extension", async () => {
    const stub = backendTaskStub("backend-1", { status: "working" });
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: stub.onJsonRpc,
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const result = expectCallToolResult(
        await withTestAgentPrincipal(() =>
          stack.toolDispatch.callTool("github.search_issues", {}),
        ),
      );
      assert.equal(result.isError, true);
      assert.equal(isParkedTaskResult(result), false);
      // Nothing will ever poll the origin, so it must not be left running.
      assert.deepEqual(cancelledBackendTaskIds(stub), ["backend-1"]);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("completes a reminted task when the backend task completes", async () => {
    const backendTaskId = "backend-done";
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: backendTaskStub(backendTaskId, {
        status: "completed",
        result: { content: [{ type: "text", text: "found" }] },
      }).onJsonRpc,
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const created = await withTestAgentPrincipal(() =>
        stack.toolDispatch.callTool(
          "github.search_issues",
          {},
          { clientDeclaresTasks: true },
        ),
      );
      assert.equal(isParkedTaskResult(created), true);
      if (!isParkedTaskResult(created)) {
        assert.fail("expected a parked task");
      }

      await withTestAgentPrincipal(() =>
        stack.toolDispatch.syncNonTerminalTask(created.taskId),
      );
      const detailed = await stack.taskStore.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(detailed.status, "completed");
      assert.deepEqual(
        (detailed as { result?: { content?: Array<{ text?: string }> } }).result
          ?.content?.[0]?.text,
        "found",
      );
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("rejects backend input_required with a traced isError result", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: (message: MockJsonRpcMessage) => {
        if (message.method !== "tools/call") {
          return undefined;
        }
        return {
          resultType: "input_required",
          requestState: "opaque-token",
          inputRequests: {
            login: { method: "elicitation/create", params: {} },
          },
        };
      },
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const result = expectCallToolResult(
        await withTestAgentPrincipal(() =>
          stack.toolDispatch.callTool("github.search_issues", {}),
        ),
      );

      assert.equal(result.isError, true);
      assert.match(
        formatBackendToolErrorForTest(result),
        /input_required/,
      );
      assert.equal(stack.traceEmitter.traces[0]?.error, BACKEND_INPUT_REQUIRED_MESSAGE);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("rejects an unrecognised backend resultType with a traced isError result", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: (message: MockJsonRpcMessage) => {
        if (message.method !== "tools/call") {
          return undefined;
        }
        return { resultType: "stream" };
      },
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const result = expectCallToolResult(
        await withTestAgentPrincipal(() =>
          stack.toolDispatch.callTool("github.search_issues", {}),
        ),
      );

      assert.equal(result.isError, true);
      assert.equal(
        stack.traceEmitter.traces[0]?.error,
        unrecognizedBackendResultTypeMessage("stream"),
      );
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("forwards a cancel to the backend under the backend's own task id", async () => {
    const backendTaskId = "backend-to-cancel";
    const stub = backendTaskStub(backendTaskId, { status: "working" });
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: stub.onJsonRpc,
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const created = await withTestAgentPrincipal(() =>
        stack.toolDispatch.callTool(
          "github.search_issues",
          {},
          { clientDeclaresTasks: true },
        ),
      );
      if (!isParkedTaskResult(created)) {
        assert.fail("expected a parked task");
      }

      await withTestAgentPrincipal(async () => {
        await stack.taskStore.requestCancel(
          TEST_AGENT_PRINCIPAL.agentId,
          created.taskId,
        );
        await stack.toolDispatch.cancelParkedTask(created.taskId);
      });

      // Demultiplexed back to the backend id, never the gateway handle.
      assert.deepEqual(cancelledBackendTaskIds(stub), [backendTaskId]);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("does not forward a cancel for a task with no backend origin", async () => {
    const stub = backendTaskStub("unused", { status: "working" });
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: stub.onJsonRpc,
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const gatewayOnly = await stack.taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });

      await withTestAgentPrincipal(() =>
        stack.toolDispatch.cancelParkedTask(gatewayOnly.taskId),
      );
      await withTestAgentPrincipal(() =>
        stack.toolDispatch.cancelParkedTask("never-existed"),
      );

      assert.deepEqual(cancelledBackendTaskIds(stub), []);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("abandons and cancels a backend task that asks for input", async () => {
    const backendTaskId = "backend-wants-input";
    const stub = backendTaskStub(backendTaskId, {
      status: "input_required",
      inputRequests: { login: { method: "elicitation/create", params: {} } },
    });
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: stub.onJsonRpc,
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const created = await withTestAgentPrincipal(() =>
        stack.toolDispatch.callTool(
          "github.search_issues",
          {},
          { clientDeclaresTasks: true },
        ),
      );
      if (!isParkedTaskResult(created)) {
        assert.fail("expected a parked task");
      }

      await withTestAgentPrincipal(() =>
        stack.toolDispatch.syncNonTerminalTask(created.taskId),
      );

      const detailed = await stack.taskStore.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(detailed.status, "completed");
      assert.equal(
        (detailed as { result?: { isError?: boolean } }).result?.isError,
        true,
      );
      assert.deepEqual(cancelledBackendTaskIds(stub), [backendTaskId]);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("abandons and cancels a backend task whose tasks/get is unrecognised", async () => {
    const backendTaskId = "backend-speaks-nonsense";
    const stub = backendTaskStub(backendTaskId, {
      status: "working",
      malformed: true,
    });
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
      onJsonRpc: stub.onJsonRpc,
    });
    const stack = await createDispatchStack(
      [noneServer("github", mockServer.url)],
      [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    );

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const created = await withTestAgentPrincipal(() =>
        stack.toolDispatch.callTool(
          "github.search_issues",
          {},
          { clientDeclaresTasks: true },
        ),
      );
      if (!isParkedTaskResult(created)) {
        assert.fail("expected a parked task");
      }

      await withTestAgentPrincipal(() =>
        stack.toolDispatch.syncNonTerminalTask(created.taskId),
      );

      const detailed = await stack.taskStore.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(detailed.status, "completed");
      assert.deepEqual(cancelledBackendTaskIds(stub), [backendTaskId]);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });
});
