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
import { InMemoryOAuthClientRepository } from "../../credentials/in-memory-oauth-client-repository.service.js";
import { InMemoryPendingLinkStore } from "../../credentials/in-memory-pending-link-store.service.js";
import { InMemoryTokenRepository } from "../../credentials/in-memory-token-repository.service.js";
import { OAuthApiController } from "../../credentials/oauth-api.controller.js";
import { OAuthConnectionReadService } from "../../credentials/oauth-connection-read.service.js";
import { OAuthLinkService } from "../../credentials/oauth-link.service.js";
import type { OAuthClientRepository } from "../../credentials/types/oauth-client-repository.js";
import type { PendingOAuthLinkStore } from "../../credentials/types/pending-oauth-link-store.js";
import type { TokenRepository } from "../../credentials/types/token-repository.js";
import type { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { GatewayHttpServer } from "../gateway-http-server.service.js";
import { GatewayMcpServer } from "../../mcp/gateway-mcp-server.service.js";
import { InMemoryTraceRepository } from "../../trace/in-memory-trace-repository.service.js";
import { TraceEmitterService } from "../../trace/trace-emitter.service.js";
import { TraceReadService } from "../../trace/trace-read.service.js";
import { TracesApiController } from "../../trace/traces-api.controller.js";
import type { TraceRepository } from "../../trace/types/trace-repository.js";
import type { TraceEmitter } from "../../trace/types/trace-emitter.js";
import { createApprovalServices } from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import {
  createInboundIdentityService,
  FixedIdentityResolver,
} from "../../identity/tests/test-helpers.js";

export function createStubToolCatalog(
  catalog: readonly CatalogTool[] = [],
  serverTools: Record<string, readonly { name: string; description?: string; allowed: boolean }[]> = {},
): ToolCatalogService {
  return {
    getCatalog: () => catalog,
    getServerTools: (serverName: string) => serverTools[serverName] ?? [],
    findTool: () => undefined,
    refresh: async () => [...catalog],
    listToolsForAgent: async () => [],
  } as unknown as ToolCatalogService;
}

export function createOAuthApiController(
  configService: ToriiConfigService,
  options: {
    tokenRepository?: TokenRepository;
    clientRepository?: OAuthClientRepository;
    pendingLinkStore?: PendingOAuthLinkStore;
  } = {},
): OAuthApiController {
  const tokenRepository = options.tokenRepository ?? new InMemoryTokenRepository();
  const clientRepository =
    options.clientRepository ?? new InMemoryOAuthClientRepository();
  const pendingLinkStore =
    options.pendingLinkStore ?? new InMemoryPendingLinkStore();

  return new OAuthApiController(
    configService,
    new OAuthLinkService(configService, tokenRepository, clientRepository, pendingLinkStore, createNoopLogger()),
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
  } = {},
): TracesApiController {
  const traceRepository = options.traceRepository ?? new InMemoryTraceRepository();
  const traceEmitter =
    options.traceEmitter ?? new TraceEmitterService(traceRepository);
  return new TracesApiController(
    new TraceReadService(traceRepository, traceEmitter),
  );
}


export function createTestGatewayHttpServer(
  toolCatalog: ToolCatalogService,
  toolDispatch: ToolDispatchService,
  options: {
    identityResolver?: AgentIdentityResolver;
    traceEmitter?: TraceEmitter;
    traceRepository?: TraceRepository;
    configService?: ToriiConfigService;
    connectionManager?: ConnectionManager;
    oauthApi?: OAuthApiController;
  } = {},
): GatewayHttpServer {
  const configService =
    options.configService ??
    new ToriiConfigService({ oauth_providers: {}, servers: [], agents: [] });
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
  const traceRepository = options.traceRepository ?? new InMemoryTraceRepository();
  const traceEmitter =
    options.traceEmitter ??
    new TraceEmitterService(traceRepository);
  const traceRead = new TraceReadService(traceRepository, traceEmitter);
  const { approvalsApi } = createApprovalServices(configService);
  const mcpServer = new GatewayMcpServer(
    toolCatalog,
    toolDispatch,
    createInboundIdentityService(options.identityResolver),
    traceEmitter,
    createNoopLogger(),
  );

  return new GatewayHttpServer(
    new ConfigApiController(configRead),
    new ConnectionsApiController(
      connectionRead,
      connectionManager,
      toolCatalog,
      configService,
    ),
    options.oauthApi ?? createOAuthApiController(configService),
    new TracesApiController(traceRead),
    approvalsApi,
    mcpServer,
    createNoopLogger(),
  );
}

export { FixedIdentityResolver };
export type { AgentIdentityResolver, AgentPrincipal };
