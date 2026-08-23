import "reflect-metadata";
import { container, type DependencyContainer, Lifecycle } from "tsyringe";
import type { ToriiConfig } from "@keidai/shared";
import type { MigrationResult, Pool } from "@keidai/postgres";
import { ConnectionManager } from "./connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "./connections/mcp-client-connector.service.js";
import { ToolCatalogService } from "./catalog/tool-catalog.service.js";
import { CredentialResolverService } from "./credentials/credential-resolver.service.js";
import { OAuthTokenLifecycleService } from "./credentials/oauth-token-lifecycle.service.js";
import { PgTokenRepository } from "./credentials/pg-token-repository.service.js";
import { PgOAuthClientRepository } from "./credentials/pg-oauth-client-repository.service.js";
import { TOKEN_REPOSITORY } from "./credentials/types/token-repository.js";
import { OAUTH_CLIENT_REPOSITORY } from "./credentials/types/oauth-client-repository.js";
import {
  TORII_DATABASE,
  openGatewayDatabase,
  resolveToriiDatabaseUrl,
} from "./storage/gateway-postgres.js";
import { NoneCredentialResolver } from "./credentials/resolvers/none-credential-resolver.service.js";
import { UserOAuthCredentialResolver } from "./credentials/resolvers/user_oauth_credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "./credentials/resolvers/service-key-credential-resolver.service.js";
import { ConfigReadService } from "./config/config-read.service.js";
import { ConfigApiController } from "./config/config-api.controller.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { ConnectionReadService } from "./connections/connection-read.service.js";
import { ConnectionsApiController } from "./connections/connections-api.controller.js";
import { PgPendingLinkStore } from "./credentials/pg-pending-link-store.service.js";
import { OAuthApiController } from "./credentials/oauth-api.controller.js";
import { OAuthConnectionReadService } from "./credentials/oauth-connection-read.service.js";
import { OAuthLinkService } from "./credentials/oauth-link.service.js";
import { PENDING_OAUTH_LINK_STORE } from "./credentials/types/pending-oauth-link-store.js";
import { ToolDispatchService } from "./dispatch/tool-dispatch.service.js";
import { InboundIdentityService } from "./identity/inbound-identity.service.js";
import { FudaJwtIdentityResolver } from "./identity/resolvers/fuda-jwt-identity-resolver.service.js";
import {
  AGENT_IDENTITY_RESOLVER,
  FUDA_JWT_CONFIG,
} from "./identity/types/tokens.js";
import { resolveFudaJwtConfig } from "./identity/utils/resolve-fuda-jwt-config.js";
import { GatewayHttpServer } from "./http/gateway-http-server.service.js";
import { GatewayMcpServer } from "./mcp/gateway-mcp-server.service.js";
import { PolicyEnforcementService } from "./policy/policy-enforcement.service.js";
import { ApprovalGateService } from "./policy/approval-gate.service.js";
import { GroupPolicyCache } from "./policy/group-policy-cache.service.js";
import { PgGroupPolicyRepository } from "./policy/pg-group-policy-repository.service.js";
import { GROUP_POLICY_REPOSITORY } from "./policy/types/group-policy-repository.js";
import { importYamlGroupPoliciesIfEmpty } from "./policy/utils/import-yaml-group-policies.js";
import { ApprovalReadService } from "./policy/approval-read.service.js";
import { ApprovalStoreService } from "./policy/approval-store.service.js";
import { TaskStoreService } from "./tasks/task-store.service.js";
import { ApprovalsApiController } from "./policy/approvals-api.controller.js";
import { StructuredLoggerService } from "./logging/structured-logger.service.js";
import { TraceEmitterService } from "./trace/trace-emitter.service.js";
import { TraceReadService } from "./trace/trace-read.service.js";
import { TracesApiController } from "./trace/traces-api.controller.js";
import { PgTraceRepository } from "./trace/pg-trace-repository.service.js";
import { TRACE_REPOSITORY } from "./trace/types/trace-repository.js";

export { TORII_DATABASE };

const SINGLETON = { lifecycle: Lifecycle.Singleton } as const;

export interface ToriiContainerResult {
  container: DependencyContainer;
  migrations: MigrationResult;
}

export interface CreateContainerOptions {
  pool?: Pool;
}

export async function createContainer(
  config: ToriiConfig,
  options: CreateContainerOptions = {},
): Promise<ToriiContainerResult> {
  const appContainer = container.createChildContainer();
  const { pool, migrations } = await openGatewayDatabase(
    options.pool ? "postgres://unused" : resolveToriiDatabaseUrl(),
    options.pool,
  );

  let tokenRepository: PgTokenRepository | undefined;
  let oauthClientRepository: PgOAuthClientRepository | undefined;
  let pendingLinkStore: PgPendingLinkStore | undefined;
  let traceRepository: PgTraceRepository | undefined;
  let groupPolicyRepository: PgGroupPolicyRepository | undefined;
  let approvalStore: ApprovalStoreService | undefined;
  let taskStore: TaskStoreService | undefined;

  appContainer.register(TORII_DATABASE, { useValue: pool });
  groupPolicyRepository = new PgGroupPolicyRepository(pool);
  await importYamlGroupPoliciesIfEmpty(groupPolicyRepository, config);
  const groupPolicyCache = new GroupPolicyCache(
    await groupPolicyRepository.list(),
  );
  appContainer.register(GROUP_POLICY_REPOSITORY, {
    useValue: groupPolicyRepository,
  });
  appContainer.register(GroupPolicyCache, { useValue: groupPolicyCache });
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
    useFactory: () => {
      pendingLinkStore ??= new PgPendingLinkStore(
        appContainer.resolve<Pool>(TORII_DATABASE),
      );
      return pendingLinkStore;
    },
  });
  appContainer.register(FUDA_JWT_CONFIG, {
    useFactory: () => resolveFudaJwtConfig(),
  });
  appContainer.register(AGENT_IDENTITY_RESOLVER, {
    useClass: FudaJwtIdentityResolver,
  });
  appContainer.register(InboundIdentityService, {
    useClass: InboundIdentityService,
  });
  appContainer.register(TOKEN_REPOSITORY, {
    useFactory: () => {
      tokenRepository ??= new PgTokenRepository(
        appContainer.resolve<Pool>(TORII_DATABASE),
      );
      return tokenRepository;
    },
  });
  appContainer.register(OAUTH_CLIENT_REPOSITORY, {
    useFactory: () => {
      oauthClientRepository ??= new PgOAuthClientRepository(
        appContainer.resolve<Pool>(TORII_DATABASE),
      );
      return oauthClientRepository;
    },
  });
  appContainer.register(TRACE_REPOSITORY, {
    useFactory: () => {
      traceRepository ??= new PgTraceRepository(
        appContainer.resolve<Pool>(TORII_DATABASE),
      );
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
  appContainer.register(ApprovalStoreService, {
    useFactory: () => {
      approvalStore ??= new ApprovalStoreService(
        appContainer.resolve<Pool>(TORII_DATABASE),
      );
      return approvalStore;
    },
  });
  appContainer.register(TaskStoreService, {
    useFactory: () => {
      taskStore ??= new TaskStoreService(
        appContainer.resolve<Pool>(TORII_DATABASE),
      );
      return taskStore;
    },
  });
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

  return { container: appContainer, migrations };
}

export function resolveToriiDatabase(appContainer: DependencyContainer): Pool {
  return appContainer.resolve<Pool>(TORII_DATABASE);
}
