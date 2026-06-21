import "reflect-metadata";
import { container, type DependencyContainer } from "tsyringe";
import type { ToriiConfig } from "@keidai/shared";
import { ConnectionManager } from "./backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "./backends/mcp-client-connector.service.js";
import { ToolCatalogService } from "./catalog/tool-catalog.service.js";
import { CredentialResolverService } from "./credentials/credential-resolver.service.js";
import { OAuthTokenLifecycleService } from "./credentials/oauth-token-lifecycle.service.js";
import { SqliteTokenRepository } from "./credentials/sqlite-token-repository.service.js";
import { TOKEN_REPOSITORY } from "./credentials/types/token-repository.js";
import { openTokenDatabase } from "./credentials/utils/sqlite-token-store.js";
import { resolveTokenStorePath } from "./credentials/utils/token-store-path.js";
import { NoneCredentialResolver } from "./credentials/resolvers/none-credential-resolver.service.js";
import { UserOAuthCredentialResolver } from "./credentials/resolvers/user_oauth_credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "./credentials/resolvers/service-key-credential-resolver.service.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { ToolDispatchService } from "./dispatch/tool-dispatch.service.js";
import { buildAgentRegistry } from "./identity/utils/build-agent-registry.js";
import { InboundIdentityService } from "./identity/inbound-identity.service.js";
import { K8sSaOidcIdentityResolver } from "./identity/resolvers/k8s-sa-oidc-identity-resolver.service.js";
import {
  AGENT_IDENTITY_RESOLVER,
  AGENT_REGISTRY,
  K8S_SA_OIDC_CONFIG,
} from "./identity/types/tokens.js";
import { resolveK8sSaOidcConfig } from "./identity/utils/resolve-k8s-sa-oidc-config.js";
import { GatewayMcpServer } from "./mcp/gateway-mcp-server.service.js";
import { PolicyEnforcementService } from "./policy/policy-enforcement.service.js";
import { TraceEmitterService } from "./trace/trace-emitter.service.js";

export function createContainer(config: ToriiConfig): DependencyContainer {
  const appContainer = container.createChildContainer();
  appContainer.register(ToriiConfigService, {
    useValue: new ToriiConfigService(config),
  });
  appContainer.register(AGENT_REGISTRY, {
    useFactory: (c) =>
      buildAgentRegistry(c.resolve(ToriiConfigService).get().agents ?? []),
  });
  appContainer.register(K8S_SA_OIDC_CONFIG, {
    useValue: resolveK8sSaOidcConfig(),
  });
  appContainer.register(AGENT_IDENTITY_RESOLVER, {
    useClass: K8sSaOidcIdentityResolver,
  });
  appContainer.register(InboundIdentityService, {
    useClass: InboundIdentityService,
  });
  appContainer.register(TOKEN_REPOSITORY, {
    useFactory: () => {
      const db = openTokenDatabase(resolveTokenStorePath());
      return new SqliteTokenRepository(db);
    },
  });
  appContainer.register(NoneCredentialResolver, {
    useClass: NoneCredentialResolver,
  });
  appContainer.register(OAuthTokenLifecycleService, {
    useClass: OAuthTokenLifecycleService,
  });
  appContainer.register(UserOAuthCredentialResolver, {
    useClass: UserOAuthCredentialResolver,
  });
  appContainer.register(ServiceKeyCredentialResolver, {
    useClass: ServiceKeyCredentialResolver,
  });
  appContainer.register(CredentialResolverService, {
    useClass: CredentialResolverService,
  });
  appContainer.register(DefaultMcpClientConnector, {
    useClass: DefaultMcpClientConnector,
  });
  appContainer.register(ConnectionManager, { useClass: ConnectionManager });
  appContainer.register(PolicyEnforcementService, {
    useClass: PolicyEnforcementService,
  });
  appContainer.register(ToolCatalogService, { useClass: ToolCatalogService });
  appContainer.register(TraceEmitterService, { useClass: TraceEmitterService });
  appContainer.register(ToolDispatchService, { useClass: ToolDispatchService });
  appContainer.register(GatewayMcpServer, { useClass: GatewayMcpServer });
  return appContainer;
}
