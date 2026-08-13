import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../tool-catalog.service.js";
import {
  AGENT_TOOL_LIST_CACHE_SCOPE,
  AGENT_TOOL_LIST_TTL_MS,
} from "../types/catalog-tool.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { createCredentialServices, bootBackends, withTestAgentPrincipal } from "../../credentials/tests/test-helpers.js";
import { createPolicyEnforcement } from "../../policy/tests/test-helpers.js";
import { testAgentsGroup } from "../../testing/test-config.js";

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

describe("ToolCatalogService", () => {
  it("namespaces tools from connected backends", async () => {
    const mockServer = await startMockMcpServer({
      tools: [
        { name: "search_issues", description: "Search GitHub issues" },
        { name: "get_file_contents", description: "Read a repository file" },
      ],
    });
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serverConfig("github", mockServer.url)],
      groups: [
        testAgentsGroup([
          { server: "github", tools: ["search_issues", "get_file_contents"] },
        ]),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      createNoopLogger(),
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const { tools, ttlMs, cacheScope } = await withTestAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      assert.deepEqual(
        tools.map((tool) => tool.name),
        ["github.get_file_contents", "github.search_issues"],
      );
      assert.equal(ttlMs, AGENT_TOOL_LIST_TTL_MS);
      assert.equal(cacheScope, AGENT_TOOL_LIST_CACHE_SCOPE);

      const searchIssues = tools.find((tool) => tool.name === "github.search_issues");
      assert.equal(searchIssues?.description, "Search GitHub issues");

      const catalog = catalogService.getCatalog();
      const fileTool = catalog.find(
        (entry) => entry.bareName === "get_file_contents",
      );
      assert.equal(fileTool?.namespacedName, "github.get_file_contents");
      assert.equal(fileTool?.server, "github");
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });

  it("filters tools denied by backend policy from tools/list", async () => {
    const mockServer = await startMockMcpServer({
      tools: [
        { name: "search_issues", description: "Search GitHub issues" },
        { name: "merge_pull_request", description: "Merge a pull request" },
      ],
    });
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          name: "github",
          transport: { type: "http", url: mockServer.url },
          credential: { strategy: "none" },
        },
      ],
      groups: [testAgentsGroup([{ server: "github", tools: ["search_issues"] }])],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      createNoopLogger(),
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const { tools } = await withTestAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      assert.deepEqual(tools.map((tool) => tool.name), ["github.search_issues"]);

      const serverTools = catalogService.getServerTools("github");
      assert.equal(serverTools.length, 2);
      assert.deepEqual(
        [...serverTools]
          .map((tool) => ({
            name: tool.name,
            allowed: tool.allowed,
          }))
          .sort((left, right) => left.name.localeCompare(right.name)),
        [
          { name: "merge_pull_request", allowed: false },
          { name: "search_issues", allowed: true },
        ],
      );
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });

  it("skips failed backends and continues fan-out", async () => {
    const goodServer = await startMockMcpServer({
      tools: [{ name: "list_customers", description: "List Stripe customers" }],
    });
    const badServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          ...serverConfig("stripe", goodServer.url),
        },
        {
          ...serverConfig("deepwiki", badServer.url),
        },
      ],
      groups: [
        testAgentsGroup([
          { server: "stripe", tools: ["list_customers"] },
          { server: "deepwiki", tools: ["read_wiki_structure"] },
        ]),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      {
      connect: async (server) => {
        const client = await new DefaultMcpClientConnector(
          credentialResolver,
        ).connect(server);
        if (server.name === "deepwiki") {
          client.listTools = async () => {
            throw new Error("auth required");
          };
        }
        return client;
      },
    },
      createNoopLogger(),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      createNoopLogger(),
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const { tools } = await withTestAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      assert.deepEqual(tools.map((tool) => tool.name), ["stripe.list_customers"]);
      assert.equal(catalogService.getCatalog().length, 1);
    } finally {
      await closeManagerConnections(connectionManager);
      await Promise.all([goodServer.close(), badServer.close()]);
    }
  });

  it("ignores backends not in connected state", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "ping", description: "Ping" }],
    });
    const closedUrl = mockServer.url;
    await mockServer.close();

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          ...serverConfig("offline", closedUrl),
        },
      ],
      groups: [testAgentsGroup([{ server: "offline", tools: ["ping"] }])],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      createNoopLogger(),
    );

    await bootBackends(connectionManager, catalogService);
    const { tools } = await withTestAgentPrincipal(() =>
      catalogService.listToolsForAgent(),
    );

    assert.deepEqual(tools, []);
    assert.deepEqual(catalogService.getCatalog(), []);
  });

  it("returns tools in stable namespaced order across repeated lists", async () => {
    const zeta = await startMockMcpServer({
      tools: [{ name: "zoom", description: "Z" }],
    });
    const alpha = await startMockMcpServer({
      tools: [
        { name: "beta", description: "B" },
        { name: "alpha", description: "A" },
      ],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        serverConfig("zeta", zeta.url),
        serverConfig("alpha", alpha.url),
      ],
      groups: [
        testAgentsGroup([
          { server: "zeta", tools: ["zoom"] },
          { server: "alpha", tools: ["beta", "alpha"] },
        ]),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      createNoopLogger(),
    );
    const catalogService = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      createNoopLogger(),
    );

    try {
      await bootBackends(connectionManager, catalogService);
      const first = await withTestAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );
      const second = await withTestAgentPrincipal(() =>
        catalogService.listToolsForAgent(),
      );

      const expected = ["alpha.alpha", "alpha.beta", "zeta.zoom"];
      assert.deepEqual(
        first.tools.map((tool) => tool.name),
        expected,
      );
      assert.deepEqual(
        second.tools.map((tool) => tool.name),
        expected,
      );
    } finally {
      await closeManagerConnections(connectionManager);
      await Promise.all([zeta.close(), alpha.close()]);
    }
  });
});
