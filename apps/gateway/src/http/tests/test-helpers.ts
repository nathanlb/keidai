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
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import type { TraceEmitter } from "../../trace/types/trace-emitter.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import {
  createInboundIdentityService,
  FixedIdentityResolver,
} from "../../identity/tests/test-helpers.js";

export function createStubToolCatalog(
  catalog: readonly CatalogTool[] = [],
): ToolCatalogService {
  return {
    getCatalog: () => catalog,
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

export function createTestGatewayHttpServer(
  toolCatalog: ToolCatalogService,
  toolDispatch: ToolDispatchService,
  options: {
    identityResolver?: AgentIdentityResolver;
    traceEmitter?: TraceEmitter;
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
  const catalog = createStubToolCatalog();
  const connectionRead = new ConnectionReadService(connectionManager, catalog);
  const mcpServer = new GatewayMcpServer(toolCatalog, toolDispatch, createInboundIdentityService(options.identityResolver), options.traceEmitter ?? new CapturingTraceEmitter(), createNoopLogger());

  return new GatewayHttpServer(new ConfigApiController(configRead), new ConnectionsApiController(connectionRead, connectionManager), options.oauthApi ?? createOAuthApiController(configService), mcpServer, createNoopLogger());
}

export { FixedIdentityResolver };
export type { AgentIdentityResolver, AgentPrincipal };
