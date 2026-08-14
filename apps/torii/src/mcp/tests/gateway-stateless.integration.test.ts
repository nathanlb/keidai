import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  ProtocolErrorCode,
  SERVER_INFO_META_KEY,
} from "@modelcontextprotocol/server";
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
import { readPackageVersion } from "../../http/utils/read-package-version.js";
import { TEST_AGENT_BEARER } from "../../identity/tests/test-helpers.js";
import { createPolicyEnforcement, createApprovalServices } from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { testAgentsGroup } from "../../testing/test-config.js";

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
    [CLIENT_INFO_META_KEY]: { name: "stateless-test-agent", version: "1.0.0" },
    [CLIENT_CAPABILITIES_META_KEY]: {},
    ...overrides,
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

async function withGateway(
  run: (ctx: { mcpUrl: string }) => Promise<void>,
): Promise<void> {
  const backend = await startMockMcpServer({
    tools: [
      { name: "search_issues", description: "Search GitHub issues" },
      {
        name: "echo",
        description: "Echo input",
        handler: async (input) => ({
          text: String(input.query ?? ""),
        }),
      },
    ],
  });

  const configService = new ToriiConfigService({
    oauth_providers: {},
    servers: [serverConfig("github", backend.url)],
    groups: [
      testAgentsGroup([
        { server: "github", tools: ["search_issues", "echo"] },
      ]),
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
    createApprovalServices(configService).taskStore,
  );
  const gatewayHttpServer = createTestGatewayHttpServer(
    toolCatalog,
    toolDispatch,
  );

  try {
    await connectionManager.connectAll();
    await toolCatalog.refresh();
    const gateway = await gatewayHttpServer.start();
    try {
      await run({ mcpUrl: gateway.mcpUrl });
    } finally {
      await gateway.close();
    }
  } finally {
    await closeManagerConnections(connectionManager);
    await backend.close();
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
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const mcpMethod = body.method;
  const toolName =
    mcpMethod === "tools/call" &&
    body.params &&
    typeof body.params.name === "string"
      ? body.params.name
      : undefined;

  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_AGENT_BEARER}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
      "mcp-method": mcpMethod,
      ...(toolName ? { "mcp-name": toolName } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json(),
  };
}

describe("Gateway MCP stateless protocol core", () => {
  it("answers server/discover with versions, capabilities, and server identity", async () => {
    await withGateway(async ({ mcpUrl }) => {
      const { status, json } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "discover-1",
        method: "server/discover",
        params: { _meta: modernMeta() },
      });

      assert.equal(status, 200);
      const result = (json as { result?: Record<string, unknown> }).result;
      assert.ok(result);
      assert.deepEqual(result.supportedVersions, [MODERN_PROTOCOL_VERSION]);
      assert.ok(
        result.capabilities &&
          typeof result.capabilities === "object" &&
          "tools" in (result.capabilities as object),
      );
      assert.deepEqual(
        (result.capabilities as { extensions?: unknown }).extensions,
        { "io.modelcontextprotocol/tasks": {} },
      );
      assert.equal(result.resultType, "complete");

      const serverInfo = (
        result._meta as Record<string, unknown> | undefined
      )?.[SERVER_INFO_META_KEY] as { name?: string; version?: string } | undefined;
      assert.deepEqual(serverInfo, {
        name: "torii-gateway",
        version: readPackageVersion(),
      });
    });
  });

  it("rejects unsupported protocol versions with UnsupportedProtocolVersionError", async () => {
    await withGateway(async ({ mcpUrl }) => {
      const { status, json } = await postMcp(
        mcpUrl,
        {
          jsonrpc: "2.0",
          id: "discover-bad",
          method: "server/discover",
          params: {
            _meta: modernMeta({
              [PROTOCOL_VERSION_META_KEY]: "2099-01-01",
            }),
          },
        },
        { "mcp-protocol-version": "2099-01-01" },
      );

      assert.ok(status === 400 || status === 200);
      const error = (json as { error?: { code?: number; data?: unknown } }).error;
      assert.ok(error);
      assert.equal(
        error.code,
        ProtocolErrorCode.UnsupportedProtocolVersion,
      );
    });
  });

  it("serves tools/list as a single self-contained POST with no handshake", async () => {
    await withGateway(async ({ mcpUrl }) => {
      const { status, json } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "list-1",
        method: "tools/list",
        params: { _meta: modernMeta() },
      });

      assert.equal(status, 200);
      const result = (json as { result?: { tools?: Array<{ name: string }> } })
        .result;
      assert.ok(result?.tools);
      assert.deepEqual(
        result.tools.map((tool) => tool.name),
        ["github.echo", "github.search_issues"],
      );
      assert.equal(
        (json as { result?: { resultType?: string } }).result?.resultType,
        "complete",
      );
    });
  });

  it("serves tools/call as a single self-contained POST with no handshake", async () => {
    await withGateway(async ({ mcpUrl }) => {
      const { status, json } = await postMcp(mcpUrl, {
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "github.echo",
          arguments: { query: "stateless" },
          _meta: modernMeta(),
        },
      });

      assert.equal(status, 200);
      const result = (
        json as {
          result?: {
            content?: Array<{ type: string; text?: string }>;
            isError?: boolean;
          };
        }
      ).result;
      assert.ok(result);
      assert.notEqual(result.isError, true);
      const text = result.content?.find((part) => part.type === "text")?.text;
      assert.equal(text, "stateless");
    });
  });

  it("does not set or require mcp-session-id", async () => {
    await withGateway(async ({ mcpUrl }) => {
      const response = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_AGENT_BEARER}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
          "mcp-method": "tools/list",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "list-2",
          method: "tools/list",
          params: { _meta: modernMeta() },
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("mcp-session-id"), null);

      const withStaleSession = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_AGENT_BEARER}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
          "mcp-method": "tools/list",
          "mcp-session-id": "stale-session-id",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "list-3",
          method: "tools/list",
          params: { _meta: modernMeta() },
        }),
      });

      assert.equal(withStaleSession.status, 200);
      const body = (await withStaleSession.json()) as {
        result?: { tools?: unknown[] };
        error?: unknown;
      };
      assert.ok(body.result?.tools);
      assert.equal(body.error, undefined);
    });
  });
});
