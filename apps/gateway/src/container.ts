import "reflect-metadata";
import { container, type DependencyContainer } from "tsyringe";
import type { ToriiConfig } from "@torii/shared";
import { ConnectionManager } from "./backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "./backends/mcp-client-connector.service.js";
import { ToolCatalogService } from "./catalog/tool-catalog.service.js";
import { CredentialResolverService } from "./credentials/credential-resolver.service.js";
import { InMemoryTokenRepository } from "./credentials/in-memory-token-repository.service.js";
import { NoneCredentialResolver } from "./credentials/resolvers/none-credential-resolver.service.js";
import { DelegatedConnectionCredentialResolver } from "./credentials/resolvers/delegated-connection-credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "./credentials/resolvers/service-key-credential-resolver.service.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { ToolDispatchService } from "./dispatch/tool-dispatch.service.js";
import { GatewayMcpServer } from "./mcp/gateway-mcp-server.service.js";

export function createContainer(config: ToriiConfig): DependencyContainer {
  const appContainer = container.createChildContainer();
  appContainer.register(ToriiConfigService, {
    useValue: new ToriiConfigService(config),
  });
  appContainer.register(InMemoryTokenRepository, {
    useClass: InMemoryTokenRepository,
  });
  appContainer.register(NoneCredentialResolver, {
    useClass: NoneCredentialResolver,
  });
  appContainer.register(DelegatedConnectionCredentialResolver, {
    useClass: DelegatedConnectionCredentialResolver,
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
  appContainer.register(ToolCatalogService, { useClass: ToolCatalogService });
  appContainer.register(ToolDispatchService, { useClass: ToolDispatchService });
  appContainer.register(GatewayMcpServer, { useClass: GatewayMcpServer });
  return appContainer;
}
