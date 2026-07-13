import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { PolicyDecision, TORII_RUN_ID_ARG, TORII_STEP_ID_ARG, TORII_CALL_META_KEY } from "@keidai/shared";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { createCredentialServices, bootBackends, withStubAgentPrincipal } from "../../credentials/tests/test-helpers.js";
import { LINKING_REQUIRED_CODE } from "../../credentials/types/credential-resolution.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import type { CapturingTraceEmitter as CapturingTraceEmitterType } from "../../trace/tests/capturing-trace-emitter.js";
import { PolicyDeniedError } from "../../policy/types/policy-denied.js";
import { createPolicyEnforcement, createApprovalServices } from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { ToolDispatchService } from "../tool-dispatch.service.js";
import {
  BackendUnavailableError,
  ToolNotFoundError,
} from "../types/tool-dispatch.js";

function noneServer(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
    policy: { default: "deny", allow: ["read_wiki_structure"] },
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
    policy: { default: "deny", allow: ["search_issues"] },
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

async function createDispatchStack(
  servers: ToriiConfig["servers"][number][],
): Promise<{
  connectionManager: ConnectionManager;
  toolCatalog: ToolCatalogService;
  toolDispatch: ToolDispatchService;
  traceEmitter: CapturingTraceEmitterType;
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
  });
  const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
  const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
  const traceEmitter = new CapturingTraceEmitter();
  const { approvalGate } = createApprovalServices(configService);
  const toolDispatch = new ToolDispatchService(
    toolCatalog,
    connectionManager,
    credentialResolver,
    traceEmitter,
    createPolicyEnforcement(configService),
    approvalGate,
  );

  return {
    connectionManager,
    toolCatalog,
    toolDispatch,
    traceEmitter,
    close: () => closeManagerConnections(connectionManager),
  };
}

describe("ToolDispatchService", () => {
  it("routes a namespaced call to the backend bare tool name", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });
    const stack = await createDispatchStack([
      noneServer("deepwiki", mockServer.url),
    ]);

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const result = await withStubAgentPrincipal(() =>
        stack.toolDispatch.callTool("deepwiki.read_wiki_structure", {}),
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
    const stack = await createDispatchStack([
      {
        ...noneServer("github", mockServer.url),
        policy: { default: "deny", allow: ["search_issues", "missing_tool"] },
      },
    ]);

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      await withStubAgentPrincipal(() =>
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
    const stack = await createDispatchStack([
      userOAuthServer("github", mockServer.url),
    ]);

    try {
      await withStubAgentPrincipal(async () => {
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

  it("emits a structured trace for allowed calls", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });
    const stack = await createDispatchStack([
      noneServer("deepwiki", mockServer.url),
    ]);

    try {
      await withStubAgentPrincipal(async () => {
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
          agentId: STUB_AGENT_PRINCIPAL.agentId,
          ownerId: STUB_AGENT_PRINCIPAL.ownerId,
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
    const stack = await createDispatchStack([
      {
        name: "github",
        transport: { type: "http", url: mockServer.url },
        credential: { strategy: "none" },
        policy: { default: "deny", allow: ["search_issues"] },
      },
    ]);

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const connection = stack.connectionManager.get("github");
      assert.ok(connection);
      connection.state = "failed";
      connection.client = null;
      connection.error = new Error("connection lost");

      await withStubAgentPrincipal(() =>
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
      await mockServer.close();
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
    });
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
    const traceEmitter = new CapturingTraceEmitter();
    const { approvalGate } = createApprovalServices(configService);
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      traceEmitter,
      createPolicyEnforcement(configService),
      approvalGate,
    );

    try {
      await withStubAgentPrincipal(async () => {
        await tokenRepository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
          accessToken: "gho_valid",
        });
        await connectionManager.connectAll();
        await toolCatalog.refresh();
        await tokenRepository.set(STUB_AGENT_PRINCIPAL.ownerId, "github", {
          accessToken: "gho_valid",
          expiresAt: new Date(0),
        });

        const result = await toolDispatch.callTool("github.search_issues", {});

        assert.equal(result.isError, true);
        assert.deepEqual(result.structuredContent, {
          code: LINKING_REQUIRED_CODE,
          provider: "github",
          ownerId: STUB_AGENT_PRINCIPAL.ownerId,
          backend: "github",
          linkUrl: result.structuredContent?.linkUrl,
        });
        assert.match(String(result.structuredContent?.linkUrl), /client_id=client/);
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
    const stack = await createDispatchStack([
      serviceKeyServer("stripe", mockServer.url, secretKey),
    ]);

    try {
      await bootBackends(stack.connectionManager, stack.toolCatalog);

      const result = await withStubAgentPrincipal(() =>
        stack.toolDispatch.callTool("stripe.list_customers", {}),
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
    const stack = await createDispatchStack([
      noneServer("deepwiki", mockServer.url),
    ]);

    try {
      await withStubAgentPrincipal(async () => {
        await stack.connectionManager.connectAll();
        await stack.toolCatalog.refresh();

        const result = await stack.toolDispatch.callTool(
          "deepwiki.read_wiki_structure",
          {
            [TORII_RUN_ID_ARG]: "run-123",
            [TORII_STEP_ID_ARG]: "step-456",
          },
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
    const stack = await createDispatchStack([
      noneServer("deepwiki", mockServer.url),
    ]);

    try {
      await withStubAgentPrincipal(async () => {
        await stack.connectionManager.connectAll();
        await stack.toolCatalog.refresh();

        const result = await stack.toolDispatch.callTool(
          "deepwiki.read_wiki_structure",
          {},
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
});
