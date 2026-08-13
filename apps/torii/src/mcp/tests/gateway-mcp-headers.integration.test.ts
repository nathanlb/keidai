import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import {
  AGENT_TOOL_LIST_CACHE_SCOPE,
  AGENT_TOOL_LIST_TTL_MS,
} from "../../catalog/types/catalog-tool.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { createTestGatewayHttpServer } from "../../http/tests/test-helpers.js";
import { TEST_AGENT_BEARER } from "../../identity/tests/test-helpers.js";
import { createPolicyEnforcement, createApprovalServices } from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { testAgentsGroup } from "../../testing/test-config.js";
import { MCP_HEADER_MISMATCH_ERROR_CODE } from "../utils/mcp-http-errors.js";

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
      { name: "echo", description: "Echo input" },
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

describe("Gateway MCP routing headers and cacheable lists", () => {
  it("rejects POSTs missing Mcp-Method with HeaderMismatch -32020", async () => {
    await withGateway(async ({ mcpUrl }) => {
      const response = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_AGENT_BEARER}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "list-missing",
          method: "tools/list",
        }),
      });

      assert.equal(response.status, 400);
      const body = (await response.json()) as {
        error?: { code?: number; message?: string };
        id?: unknown;
      };
      assert.equal(body.error?.code, MCP_HEADER_MISMATCH_ERROR_CODE);
      assert.match(body.error?.message ?? "", /Mcp-Method header is missing/);
      assert.equal(body.id, "list-missing");
    });
  });

  it("rejects Mcp-Method mismatches with HeaderMismatch -32020", async () => {
    await withGateway(async ({ mcpUrl }) => {
      const response = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_AGENT_BEARER}`,
          "content-type": "application/json",
          "mcp-method": "tools/call",
          "mcp-name": "github.echo",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "mismatch-method",
          method: "tools/list",
        }),
      });

      assert.equal(response.status, 400);
      const body = (await response.json()) as {
        error?: { code?: number };
      };
      assert.equal(body.error?.code, MCP_HEADER_MISMATCH_ERROR_CODE);
    });
  });

  it("rejects Mcp-Name mismatches with HeaderMismatch -32020", async () => {
    await withGateway(async ({ mcpUrl }) => {
      const response = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_AGENT_BEARER}`,
          "content-type": "application/json",
          "mcp-method": "tools/call",
          "mcp-name": "github.echo",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "mismatch-name",
          method: "tools/call",
          params: { name: "github.search_issues", arguments: {} },
        }),
      });

      assert.equal(response.status, 400);
      const body = (await response.json()) as {
        error?: { code?: number; message?: string };
      };
      assert.equal(body.error?.code, MCP_HEADER_MISMATCH_ERROR_CODE);
      assert.match(body.error?.message ?? "", /github\.echo.*github\.search_issues/);
    });
  });

  it("emits ttlMs and private cacheScope on tools/list", async () => {
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
          id: "list-cache",
          method: "tools/list",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
              "io.modelcontextprotocol/clientInfo": {
                name: "header-test-agent",
                version: "1.0.0",
              },
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        result?: {
          tools?: Array<{ name: string }>;
          ttlMs?: number;
          cacheScope?: string;
        };
      };
      assert.deepEqual(
        body.result?.tools?.map((tool) => tool.name),
        ["github.echo", "github.search_issues"],
      );
      assert.equal(body.result?.ttlMs, AGENT_TOOL_LIST_TTL_MS);
      assert.equal(body.result?.cacheScope, AGENT_TOOL_LIST_CACHE_SCOPE);
    });
  });
});
