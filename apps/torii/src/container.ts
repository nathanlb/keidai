import "reflect-metadata";
import { container, type DependencyContainer, Lifecycle } from "tsyringe";
import type { ToriiConfig } from "@keidai/shared";
import { ConnectionManager } from "./connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "./connections/mcp-client-connector.service.js";
import { ToolCatalogService } from "./catalog/tool-catalog.service.js";
import { CredentialResolverService } from "./credentials/credential-resolver.service.js";
import { OAuthTokenLifecycleService } from "./credentials/oauth-token-lifecycle.service.js";
import { SqliteTokenRepository } from "./credentials/sqlite-token-repository.service.js";
import { SqliteOAuthClientRepository } from "./credentials/sqlite-oauth-client-repository.service.js";
import { TOKEN_REPOSITORY } from "./credentials/types/token-repository.js";
import { OAUTH_CLIENT_REPOSITORY } from "./credentials/types/oauth-client-repository.js";
import { resolveGatewayDbPath } from "./storage/gateway-db-path.js";
import { openGatewayDatabase } from "./storage/gateway-sqlite.js";
import { NoneCredentialResolver } from "./credentials/resolvers/none-credential-resolver.service.js";
import { UserOAuthCredentialResolver } from "./credentials/resolvers/user_oauth_credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "./credentials/resolvers/service-key-credential-resolver.service.js";
import { ConfigReadService } from "./config/config-read.service.js";
import { ConfigApiController } from "./config/config-api.controller.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { ConnectionReadService } from "./connections/connection-read.service.js";
import { ConnectionsApiController } from "./connections/connections-api.controller.js";
import { InMemoryPendingLinkStore } from "./credentials/in-memory-pending-link-store.service.js";
import { OAuthApiController } from "./credentials/oauth-api.controller.js";
import { OAuthConnectionReadService } from "./credentials/oauth-connection-read.service.js";
import { OAuthLinkService } from "./credentials/oauth-link.service.js";
import { PENDING_OAUTH_LINK_STORE } from "./credentials/types/pending-oauth-link-store.js";
import { ToolDispatchService } from "./dispatch/tool-dispatch.service.js";
import { buildAgentRegistry } from "./identity/utils/build-agent-registry.js";
import { buildBearerAgentRegistry } from "./identity/utils/build-bearer-agent-registry.js";
import { InboundIdentityService } from "./identity/inbound-identity.service.js";
import { CompositeAgentIdentityResolver } from "./identity/resolvers/composite-agent-identity-resolver.service.js";
import { K8sSaOidcIdentityResolver } from "./identity/resolvers/k8s-sa-oidc-identity-resolver.service.js";
import {
  AGENT_BEARER_REGISTRY,
  AGENT_IDENTITY_RESOLVER,
  AGENT_REGISTRY,
} from "./identity/types/tokens.js";
import { tryResolveK8sSaOidcConfig } from "./identity/utils/resolve-k8s-sa-oidc-config.js";
import { GatewayHttpServer } from "./http/gateway-http-server.service.js";
import { GatewayMcpServer } from "./mcp/gateway-mcp-server.service.js";
import { PolicyEnforcementService } from "./policy/policy-enforcement.service.js";
import { ApprovalGateService } from "./policy/approval-gate.service.js";
import { ApprovalReadService } from "./policy/approval-read.service.js";
import { ApprovalStoreService } from "./policy/approval-store.service.js";
import { ApprovalsApiController } from "./policy/approvals-api.controller.js";
import { StructuredLoggerService } from "./logging/structured-logger.service.js";
import { TraceEmitterService } from "./trace/trace-emitter.service.js";
import { TraceReadService } from "./trace/trace-read.service.js";
import { TracesApiController } from "./trace/traces-api.controller.js";
import { SqliteTraceRepository } from "./trace/sqlite-trace-repository.service.js";
import { TRACE_REPOSITORY } from "./trace/types/trace-repository.js";

const SINGLETON = { lifecycle: Lifecycle.Singleton } as const;

export function createContainer(config: ToriiConfig): DependencyContainer {
  const appContainer = container.createChildContainer();
  let gatewayDatabase: ReturnType<typeof openGatewayDatabase> | undefined;

  const resolveGatewayDatabase = () => {
    gatewayDatabase ??= openGatewayDatabase(resolveGatewayDbPath());
    return gatewayDatabase;
  };

  let tokenRepository: SqliteTokenRepository | undefined;
  let oauthClientRepository: SqliteOAuthClientRepository | undefined;
  let traceRepository: SqliteTraceRepository | undefined;
  appContainer.register(ToriiConfigService, {
    useValue: new ToriiConfigService(config),
  });
  appContainer.register(
    ConfigReadService,
    { useClass: ConfigReadService },
    SINGLETON,
  );
  appContainer.register(
    ConfigApiController,
    { useClass: ConfigApiController },
    SINGLETON,
  );
  appContainer.register(
    ConnectionReadService,
    { useClass: ConnectionReadService },
    SINGLETON,
  );
  appContainer.register(
    ConnectionsApiController,
    { useClass: ConnectionsApiController },
    SINGLETON,
  );
  appContainer.register(
    TraceReadService,
    { useClass: TraceReadService },
    SINGLETON,
  );
  appContainer.register(
    TracesApiController,
    { useClass: TracesApiController },
    SINGLETON,
  );
  appContainer.register(
    OAuthLinkService,
    { useClass: OAuthLinkService },
    SINGLETON,
  );
  appContainer.register(
    OAuthConnectionReadService,
    { useClass: OAuthConnectionReadService },
    SINGLETON,
  );
  appContainer.register(
    OAuthApiController,
    { useClass: OAuthApiController },
    SINGLETON,
  );
  appContainer.register(PENDING_OAUTH_LINK_STORE, {
    useFactory: () => new InMemoryPendingLinkStore(),
  });
  appContainer.register(AGENT_REGISTRY, {
    useFactory: (c) =>
      buildAgentRegistry(c.resolve(ToriiConfigService).get().agents ?? []),
  });
  appContainer.register(AGENT_BEARER_REGISTRY, {
    useFactory: (c) =>
      buildBearerAgentRegistry(
        c.resolve(ToriiConfigService).get().agents ?? [],
      ),
  });
  appContainer.register(AGENT_IDENTITY_RESOLVER, {
    useFactory: (c) => {
      const k8sConfig = tryResolveK8sSaOidcConfig();
      const k8sResolver = k8sConfig
        ? new K8sSaOidcIdentityResolver(
            c.resolve(AGENT_REGISTRY),
            k8sConfig,
          )
        : null;
      return new CompositeAgentIdentityResolver(
        c.resolve(AGENT_BEARER_REGISTRY),
        k8sResolver,
      );
    },
  });
  appContainer.register(InboundIdentityService, {
    useClass: InboundIdentityService,
  });
  appContainer.register(TOKEN_REPOSITORY, {
    useFactory: () => {
      tokenRepository ??= new SqliteTokenRepository(resolveGatewayDatabase());
      return tokenRepository;
    },
  });
  appContainer.register(OAUTH_CLIENT_REPOSITORY, {
    useFactory: () => {
      oauthClientRepository ??= new SqliteOAuthClientRepository(
        resolveGatewayDatabase(),
      );
      return oauthClientRepository;
    },
  });
  appContainer.register(TRACE_REPOSITORY, {
    useFactory: () => {
      traceRepository ??= new SqliteTraceRepository(resolveGatewayDatabase());
      return traceRepository;
    },
  });
  appContainer.register(
    NoneCredentialResolver,
    { useClass: NoneCredentialResolver },
    SINGLETON,
  );
  appContainer.register(
    OAuthTokenLifecycleService,
    { useClass: OAuthTokenLifecycleService },
    SINGLETON,
  );
  appContainer.register(
    UserOAuthCredentialResolver,
    { useClass: UserOAuthCredentialResolver },
    SINGLETON,
  );
  appContainer.register(
    ServiceKeyCredentialResolver,
    { useClass: ServiceKeyCredentialResolver },
    SINGLETON,
  );
  appContainer.register(
    CredentialResolverService,
    { useClass: CredentialResolverService },
    SINGLETON,
  );
  appContainer.register(
    DefaultMcpClientConnector,
    { useClass: DefaultMcpClientConnector },
    SINGLETON,
  );
  appContainer.register(
    ConnectionManager,
    { useClass: ConnectionManager },
    SINGLETON,
  );
  appContainer.register(
    PolicyEnforcementService,
    { useClass: PolicyEnforcementService },
    SINGLETON,
  );
  appContainer.register(
    ApprovalStoreService,
    { useClass: ApprovalStoreService },
    SINGLETON,
  );
  appContainer.register(
    ApprovalGateService,
    { useClass: ApprovalGateService },
    SINGLETON,
  );
  appContainer.register(
    ApprovalReadService,
    { useClass: ApprovalReadService },
    SINGLETON,
  );
  appContainer.register(
    ApprovalsApiController,
    { useClass: ApprovalsApiController },
    SINGLETON,
  );
  appContainer.register(
    ToolCatalogService,
    { useClass: ToolCatalogService },
    SINGLETON,
  );
  appContainer.register(
    StructuredLoggerService,
    { useClass: StructuredLoggerService },
    SINGLETON,
  );
  appContainer.register(
    TraceEmitterService,
    { useClass: TraceEmitterService },
    SINGLETON,
  );
  appContainer.register(
    ToolDispatchService,
    { useClass: ToolDispatchService },
    SINGLETON,
  );
  appContainer.register(
    GatewayMcpServer,
    { useClass: GatewayMcpServer },
    SINGLETON,
  );
  appContainer.register(
    GatewayHttpServer,
    { useClass: GatewayHttpServer },
    SINGLETON,
  );

  // Child containers inherit @injectable() registrations from the global
  // container (Transient). Pin shared stateful services so every resolve and
  // constructor injection receives the same instance.
  appContainer.registerInstance(
    ConnectionManager,
    appContainer.resolve(ConnectionManager),
  );

  return appContainer;
}
