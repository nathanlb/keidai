import "reflect-metadata";
import { container, type DependencyContainer } from "tsyringe";
import type { ToriiConfig } from "@torii/shared";
import { ConnectionManager } from "./backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "./backends/mcp-client-connector.service.js";
import { ToolCatalogService } from "./catalog/tool-catalog.service.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { GatewayMcpServer } from "./mcp/gateway-mcp-server.service.js";

export function createContainer(config: ToriiConfig): DependencyContainer {
  const appContainer = container.createChildContainer();
  appContainer.register(ToriiConfigService, {
    useValue: new ToriiConfigService(config),
  });
  appContainer.register(DefaultMcpClientConnector, {
    useClass: DefaultMcpClientConnector,
  });
  appContainer.register(ConnectionManager, { useClass: ConnectionManager });
  appContainer.register(ToolCatalogService, { useClass: ToolCatalogService });
  appContainer.register(GatewayMcpServer, { useClass: GatewayMcpServer });
  return appContainer;
}
