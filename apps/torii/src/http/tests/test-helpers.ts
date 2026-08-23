import type {
  AgentIdentityResolver,
  AgentPrincipal,
} from "@keidai/shared";
import type { CatalogTool } from "../../catalog/types/catalog-tool.js";
import type { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ConnectionsApiController } from "../../connections/connections-api.controller.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { ConnectionReadService } from "../../connections/connection-read.service.js";
import { ConfigApiController } from "../../config/config-api.controller.js";
import { ConfigReadService } from "../../config/config-read.service.js";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { OAuthApiController } from "../../credentials/oauth-api.controller.js";
import { OAuthConnectionReadService } from "../../credentials/oauth-connection-read.service.js";
import { OAuthLinkService } from "../../credentials/oauth-link.service.js";
import type { OAuthClientRepository } from "../../credentials/types/oauth-client-repository.js";
import type { PendingOAuthLinkStore } from "../../credentials/types/pending-oauth-link-store.js";
import type { TokenRepository } from "../../credentials/types/token-repository.js";
import type { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { GatewayHttpServer } from "../gateway-http-server.service.js";
import { GatewayMcpServer } from "../../mcp/gateway-mcp-server.service.js";
import { TaskStoreService } from "../../tasks/task-store.service.js";
import { TraceEmitterService } from "../../trace/trace-emitter.service.js";
import { TraceReadService } from "../../trace/trace-read.service.js";
import { TracesApiController } from "../../trace/traces-api.controller.js";
import type { TraceRepository } from "../../trace/types/trace-repository.js";
import type { TraceEmitter } from "../../trace/types/trace-emitter.js";
import {
  createApprovalServices,
  type ApprovalServices,
} from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import {
  createInboundIdentityService,
  FixedIdentityResolver,
} from "../../identity/tests/test-helpers.js";
import {
  createTestGatewayPersistence,
  type TestGatewayPersistence,
} from "../../testing/gateway-persistence.js";
import { MockOAuthClientRepository } from "../../testing/mocks/mock-oauth-client-repository.js";
import { MockPendingLinkStore } from "../../testing/mocks/mock-pending-link-store.js";
import { MockTokenRepository } from "../../testing/mocks/mock-token-repository.js";
import { MockTraceRepository } from "../../testing/mocks/mock-trace-repository.js";
import { MockGroupPolicyRepository } from "../../testing/mocks/mock-group-policy-repository.js";

// Opt out of ecosystem BFF service-token hardening for HTTP unit tests.
// Gate-focused tests clear this and set BFF_SERVICE_TOKEN explicitly.
process.env.BFF_SERVICE_TOKEN_DISABLED ??= "true";

export function createStubToolCatalog(
  catalog: readonly CatalogTool[] = [],
  serverTools: Record<
    string,
    readonly { name: string; description?: string; allowed: boolean }[]
  > = {},
): ToolCatalogService {
  return {
    getCatalog: () => catalog,
    getServerTools: (serverName: string) => serverTools[serverName] ?? [],
    findTool: () => undefined,
    refresh: async () => [...catalog],
    listToolsForAgent: async () => ({
      tools: [],
      ttlMs: 0,
      cacheScope: "private",
    }),
  } as unknown as ToolCatalogService;
}

function memoryPersistence(): TestGatewayPersistence {
  return {
    tokenRepository: new MockTokenRepository(),
    clientRepository: new MockOAuthClientRepository(),
    pendingLinkStore: new MockPendingLinkStore(),
    traceRepository: new MockTraceRepository(),
    groupPolicyRepository: new MockGroupPolicyRepository(),
    close: async () => {},
  };
}

export function createOAuthApiController(
  configService: ToriiConfigService,
  options: {
    tokenRepository?: TokenRepository;
    clientRepository?: OAuthClientRepository;
    pendingLinkStore?: PendingOAuthLinkStore;
    persistence?: TestGatewayPersistence;
  } = {},
): OAuthApiController {
  const persistence = options.persistence ?? memoryPersistence();
  const tokenRepository =
    options.tokenRepository ?? persistence.tokenRepository;
  const clientRepository =
    options.clientRepository ?? persistence.clientRepository;
  const pendingLinkStore =
    options.pendingLinkStore ?? persistence.pendingLinkStore;

  return new OAuthApiController(
    configService,
    new OAuthLinkService(
      configService,
      tokenRepository,
      clientRepository,
      pendingLinkStore,
      createNoopLogger(),
    ),
    new OAuthConnectionReadService(
      configService,
      tokenRepository,
      pendingLinkStore,
    ),
  );
}

export function createTracesApiController(
  options: {
    traceRepository?: TraceRepository;
    traceEmitter?: TraceEmitter;
    persistence?: TestGatewayPersistence;
  } = {},
): TracesApiController {
  const persistence = options.persistence ?? memoryPersistence();
  const traceRepository =
    options.traceRepository ?? persistence.traceRepository;
  const traceEmitter =
    options.traceEmitter ?? new TraceEmitterService(traceRepository);
  return new TracesApiController(
    new TraceReadService(traceRepository, traceEmitter),
  );
}

export async function createTestGatewayHttpServer(
  toolCatalog: ToolCatalogService,
  toolDispatch: ToolDispatchService,
  options: {
    identityResolver?: AgentIdentityResolver;
    traceEmitter?: TraceEmitter;
    traceRepository?: TraceRepository;
    configService?: ToriiConfigService;
    connectionManager?: ConnectionManager;
    oauthApi?: OAuthApiController;
    approvalServices?: ApprovalServices;
    persistence?: TestGatewayPersistence;
    taskStore?: TaskStoreService;
  } = {},
): Promise<GatewayHttpServer> {
  const configService =
    options.configService ??
    new ToriiConfigService({
      oauth_providers: {},
      servers: [],
    });
  const ownedPersistence = options.persistence === undefined
    && options.approvalServices === undefined;
  const approvalServices =
    options.approvalServices ??
    (await createApprovalServices(configService, options.persistence));
  const persistence = options.persistence ?? approvalServices.persistence;
  const pool = persistence.pool;
  if (!pool) {
    throw new Error("createTestGatewayHttpServer requires postgres persistence");
  }
  const configRead = new ConfigReadService(configService);
  const connectionManager =
    options.connectionManager ??
    new ConnectionManager(
      configService,
      {
        connect: async () => {
          throw new Error("connection manager not configured for test");
        },
      },
      createNoopLogger(),
    );
  const connectionRead = new ConnectionReadService(
    connectionManager,
    toolCatalog,
  );
  const traceRepository =
    options.traceRepository ?? persistence.traceRepository;
  const traceEmitter =
    options.traceEmitter ?? new TraceEmitterService(traceRepository);
  const traceRead = new TraceReadService(traceRepository, traceEmitter);
  const mcpServer = new GatewayMcpServer(
    toolCatalog,
    toolDispatch,
    options.taskStore ?? approvalServices.taskStore,
    createInboundIdentityService(options.identityResolver),
    traceEmitter,
    createNoopLogger(),
  );

  const server = new GatewayHttpServer(
    new ConfigApiController(configRead),
    new ConnectionsApiController(
      connectionRead,
      connectionManager,
      toolCatalog,
    ),
    options.oauthApi ??
      createOAuthApiController(configService, { persistence }),
    new TracesApiController(traceRead),
    approvalServices.approvalsApi,
    mcpServer,
    createNoopLogger(),
    pool,
  );
  if (ownedPersistence) {
    wrapServerClose(server, persistence);
  }
  return server;
}

function wrapServerClose(
  server: GatewayHttpServer,
  persistence: TestGatewayPersistence,
): void {
  const start = server.start.bind(server);
  server.start = async (options) => {
    const handle = await start(options);
    return {
      ...handle,
      close: async () => {
        await handle.close();
        await persistence.close();
      },
    };
  };
}

export { FixedIdentityResolver };
export { createTestGatewayPersistence };
export type { AgentIdentityResolver, AgentPrincipal, TestGatewayPersistence };
