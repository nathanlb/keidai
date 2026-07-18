import "reflect-metadata";
import type { ToriiConfig } from "@keidai/shared";
import { ConnectionManager } from "../../../torii/src/connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../../torii/src/connections/mcp-client-connector.service.js";
import {
  startMockMcpServer,
  type MockToolDefinition,
} from "../../../torii/src/connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../../torii/src/catalog/tool-catalog.service.js";
import { ToriiConfigService } from "../../../torii/src/config/torii-config.service.js";
import { createCredentialServices } from "../../../torii/src/credentials/tests/test-helpers.js";
import { ToolDispatchService } from "../../../torii/src/dispatch/tool-dispatch.service.js";
import { runWithAgentPrincipal } from "../../../torii/src/identity/agent-principal-context.js";
import { FixedIdentityResolver } from "../../../torii/src/identity/tests/test-helpers.js";
import { createTestGatewayHttpServer } from "../../../torii/src/http/tests/test-helpers.js";
import {
  createApprovalServices,
  createPolicyEnforcement,
} from "../../../torii/src/policy/tests/test-helpers.js";
import { createNoopLogger } from "../../../torii/src/logging/tests/test-helpers.js";
import { CapturingTraceEmitter } from "../../../torii/src/trace/tests/capturing-trace-emitter.js";

export const EVAL_AGENT_ID = "shaiden-newsletter-01";
export const EVAL_OWNER = "eval-owner";
export const EVAL_BEARER = "eval-shaiden-bearer";

const EVAL_PRINCIPAL = {
  agentId: EVAL_AGENT_ID,
  ownerId: EVAL_OWNER,
  groups: ["agents"],
};

const EVAL_OAUTH_PROVIDERS: ToriiConfig["oauth_providers"] = {
  google: {
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    client_id: "eval-client",
    client_secret: "eval-secret",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
  },
};

export interface EvalToriiStack {
  mcpUrl: string;
  httpBaseUrl: string;
  close(): Promise<void>;
}

export interface EvalToriiStackOptions {
  linearTools?: MockToolDefinition[];
  gmailTools?: MockToolDefinition[];
  /** When false, omit the gmail server so the agent cannot call gmail.create_draft. */
  includeGmail?: boolean;
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

/**
 * Boots an in-process Torii gateway backed by mock MCP servers. Shaiden connects
 * over real MCP/HTTP — same path as production, with deterministic tool payloads.
 */
export async function startEvalToriiStack(
  options: EvalToriiStackOptions = {},
): Promise<EvalToriiStack> {
  const linearKey = "eval-linear-key";
  const googleToken = "eval-google-token";

  const includeGmail = options.includeGmail ?? true;

  const linearBackend = await startMockMcpServer({
    requireAuth: true,
    expectedBearer: linearKey,
    tools: options.linearTools ?? [
      { name: "list_issues", description: "List Linear issues" },
      { name: "get_issue", description: "Get a Linear issue" },
    ],
  });
  const gmailBackend = includeGmail
    ? await startMockMcpServer({
        requireAuth: true,
        expectedBearer: googleToken,
        tools: options.gmailTools ?? [
          { name: "create_draft", description: "Create Gmail draft" },
        ],
      })
    : undefined;

  const { tokenRepository, credentialResolver } = createCredentialServices({
    oauth_providers: EVAL_OAUTH_PROVIDERS,
  });
  await tokenRepository.set(EVAL_OWNER, "google", {
    accessToken: googleToken,
  });

  const configService = new ToriiConfigService({
    oauth_providers: EVAL_OAUTH_PROVIDERS,
    agents: [
      {
        subject: {
          kind: "k8s_service_account",
          namespace: "torii-agents",
          service_account: "shaiden",
        },
        agent_id: EVAL_AGENT_ID,
        owner_id: EVAL_OWNER,
        groups: EVAL_PRINCIPAL.groups,
        gated_tools: includeGmail ? ["gmail.create_draft"] : [],
      },
    ],
    servers: [
      {
        name: "linear",
        transport: { type: "http", url: linearBackend.url },
        credential: { strategy: "service_key", key: linearKey },
        policy: {
          default: "deny",
          allow: ["list_issues", "get_issue"],
        },
      },
      ...(includeGmail && gmailBackend
        ? [
            {
              name: "gmail",
              transport: { type: "http" as const, url: gmailBackend.url },
              credential: {
                strategy: "user_oauth" as const,
                provider: "google",
              },
              policy: { default: "deny" as const, allow: ["create_draft"] },
            },
          ]
        : []),
    ],
  });

  const connectionManager = new ConnectionManager(
    configService,
    new DefaultMcpClientConnector(credentialResolver),
    createNoopLogger(),
  );
  const policyEnforcement = createPolicyEnforcement(configService);
  const toolCatalog = new ToolCatalogService(
    connectionManager,
    credentialResolver,
    policyEnforcement,
    createNoopLogger(),
  );
  const traceEmitter = new CapturingTraceEmitter();
  const approvalServices = createApprovalServices(configService);
  const toolDispatch = new ToolDispatchService(
    toolCatalog,
    connectionManager,
    credentialResolver,
    traceEmitter,
    policyEnforcement,
    approvalServices.approvalGate,
  );
  const gatewayHttpServer = createTestGatewayHttpServer(
    toolCatalog,
    toolDispatch,
    {
      identityResolver: new FixedIdentityResolver(EVAL_PRINCIPAL),
      traceEmitter,
      configService,
      connectionManager,
      approvalServices,
    },
  );

  await runWithAgentPrincipal(EVAL_PRINCIPAL, async () => {
    await connectionManager.connectAll();
    await toolCatalog.refresh();
  });

  const gateway = await gatewayHttpServer.start();

  return {
    mcpUrl: gateway.mcpUrl,
    httpBaseUrl: gateway.baseUrl,
    close: async () => {
      await gateway.close();
      await closeManagerConnections(connectionManager);
      await Promise.all([
        linearBackend.close(),
        gmailBackend?.close(),
      ].filter((close): close is Promise<void> => close !== undefined));
    },
  };
}
