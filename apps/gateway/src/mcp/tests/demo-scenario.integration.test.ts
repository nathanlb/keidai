import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { PolicyDecision } from "@keidai/shared";
import { ConnectionManager } from "../../backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../backends/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../backends/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { runWithAgentPrincipal } from "../../identity/agent-principal-context.js";
import {
  connectAgentToGateway,
  createTestGatewayMcpServer,
  FixedIdentityResolver,
} from "../../identity/tests/test-helpers.js";
import { createPolicyEnforcement } from "../../policy/tests/test-helpers.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";

const DEMO_OWNER = "demo-owner";
const DEMO_PRINCIPAL = {
  agentId: "demo-agent-01",
  ownerId: DEMO_OWNER,
  groups: ["agents"],
};

const DEMO_OAUTH_PROVIDERS: ToriiConfig["oauth_providers"] = {
  github: {
    token_url: "https://github.com/login/oauth/access_token",
    client_id: "client",
    client_secret: "secret",
    scopes: ["repo"],
    redirect_uri: "http://127.0.0.1:8765/callback",
  },
  notion: {
    authorize_url: "https://api.notion.com/v1/oauth/authorize",
    token_url: "https://api.notion.com/v1/oauth/token",
    client_id: "client",
    client_secret: "secret",
    scopes: [],
    redirect_uri: "https://127.0.0.1:8765/callback",
  },
  google: {
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    client_id: "client",
    client_secret: "secret",
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    redirect_uri: "http://127.0.0.1:8765/callback",
  },
};

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

describe("Demo scenario — open-torii status digest", () => {
  it("exposes only allow-listed tools and enforces policy on writes", async () => {
    const linearKey = "lin_test_key";
    const githubToken = "gho_demo";
    const notionToken = "ntn_demo";
    const googleToken = "gmail_demo";

    const linearBackend = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: linearKey,
      tools: [
        { name: "list_issues", description: "List Linear issues" },
        { name: "get_issue", description: "Get a Linear issue" },
        { name: "create_issue", description: "Create a Linear issue" },
      ],
    });
    const githubBackend = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: githubToken,
      tools: [
        { name: "search_issues", description: "Search GitHub issues" },
        { name: "merge_pull_request", description: "Merge a pull request" },
      ],
    });
    const notionBackend = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: notionToken,
      tools: [
        { name: "notion-search", description: "Search Notion" },
        { name: "notion-fetch", description: "Fetch Notion page" },
        { name: "notion-create-pages", description: "Create Notion pages" },
        { name: "notion-update-page", description: "Update Notion page" },
      ],
    });
    const gmailBackend = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: googleToken,
      tools: [
        { name: "send_gmail_message", description: "Send Gmail message" },
        { name: "search_gmail_messages", description: "Search Gmail" },
      ],
    });

    const { tokenRepository, credentialResolver } = createCredentialServices({
      oauth_providers: DEMO_OAUTH_PROVIDERS,
    });
    await tokenRepository.set(DEMO_OWNER, "github", { accessToken: githubToken });
    await tokenRepository.set(DEMO_OWNER, "notion", { accessToken: notionToken });
    await tokenRepository.set(DEMO_OWNER, "google", { accessToken: googleToken });

    const configService = new ToriiConfigService({
      oauth_providers: DEMO_OAUTH_PROVIDERS,
      agents: [
        {
          subject: {
            kind: "k8s_service_account",
            namespace: "torii-agents",
            service_account: "demo-agent",
          },
          agent_id: DEMO_PRINCIPAL.agentId,
          owner_id: DEMO_OWNER,
          groups: DEMO_PRINCIPAL.groups,
        },
      ],
      servers: [
        {
          name: "linear",
          transport: { type: "http", url: linearBackend.url },
          credential: { strategy: "service_key", key: linearKey },
          policy: {
            default: "deny",
            allow: ["list_issues", "get_issue", "list_projects"],
          },
        },
        {
          name: "github",
          transport: { type: "http", url: githubBackend.url },
          credential: { strategy: "user_oauth", provider: "github" },
          policy: { default: "deny", allow: ["search_issues", "get_file_contents"] },
        },
        {
          name: "notion",
          transport: { type: "http", url: notionBackend.url },
          credential: { strategy: "user_oauth", provider: "notion" },
          policy: { default: "deny", allow: ["notion-search", "notion-fetch"] },
        },
        {
          name: "gmail",
          transport: { type: "http", url: gmailBackend.url },
          credential: { strategy: "user_oauth", provider: "google" },
          policy: { default: "deny", allow: ["send_gmail_message"] },
        },
      ],
    });

    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const toolCatalog = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
    );
    const traceEmitter = new CapturingTraceEmitter();
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      traceEmitter,
      createPolicyEnforcement(configService),
    );
    const gatewayMcpServer = createTestGatewayMcpServer(
      toolCatalog,
      toolDispatch,
      {
        identityResolver: new FixedIdentityResolver(DEMO_PRINCIPAL),
        traceEmitter,
      },
    );

    try {
      await runWithAgentPrincipal(DEMO_PRINCIPAL, async () => {
        await connectionManager.connectAll();
      });

      const gateway = await gatewayMcpServer.start();
      const agent = await connectAgentToGateway(gateway.url);

      try {
        const tools = await agent.client.listTools();
        const toolNames = tools.tools.map((tool) => tool.name).sort();

        assert.deepEqual(toolNames, [
          "github.search_issues",
          "gmail.send_gmail_message",
          "linear.get_issue",
          "linear.list_issues",
          "notion.notion-fetch",
          "notion.notion-search",
        ]);
        assert.doesNotMatch(toolNames.join(","), /notion-create-pages/);
        assert.doesNotMatch(toolNames.join(","), /notion-update-page/);

        const linearResult = await agent.client.callTool({
          name: "linear.list_issues",
          arguments: { project: "open-torii" },
        });
        assert.notEqual(linearResult.isError, true);

        const githubResult = await agent.client.callTool({
          name: "github.search_issues",
          arguments: { query: "open-torii" },
        });
        assert.notEqual(githubResult.isError, true);

        const notionResult = await agent.client.callTool({
          name: "notion.notion-search",
          arguments: { query: "open-torii architecture" },
        });
        assert.notEqual(notionResult.isError, true);

        const gmailResult = await agent.client.callTool({
          name: "gmail.send_gmail_message",
          arguments: {
            to: "owner@example.com",
            subject: "open-torii status digest",
            body: "## Linear\n- NAT-16\n\n## GitHub\n- PR #1\n\n## Notion\n- Architecture doc",
          },
        });
        assert.notEqual(gmailResult.isError, true);

        await assert.rejects(
          () =>
            agent.client.callTool({
              name: "notion.notion-create-pages",
              arguments: { title: "Status digest" },
            }),
          /policy_denied: notion.notion-create-pages/,
        );

        const deniedTrace = traceEmitter.traces.find(
          (trace) => trace.tool === "notion-create-pages",
        );
        assert.ok(deniedTrace);
        assert.equal(deniedTrace.policyDecision, PolicyDecision.Denied);

        const allowedTraces = traceEmitter.traces.filter(
          (trace) => trace.policyDecision === PolicyDecision.Allowed,
        );
        assert.ok(allowedTraces.length >= 4);
      } finally {
        await agent.close();
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await Promise.all([
        linearBackend.close(),
        githubBackend.close(),
        notionBackend.close(),
        gmailBackend.close(),
      ]);
    }
  });
});
