import "reflect-metadata";
import { container, type DependencyContainer } from "tsyringe";
import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { ConnectionManager } from "./backends/connection-manager.js";
import { DefaultMcpClientConnector } from "./backends/mcp-client-connector.js";

export function createContainer(config: ToriiConfig): DependencyContainer {
  const appContainer = container.createChildContainer();
  appContainer.register(ToriiConfigService, {
    useValue: new ToriiConfigService(config),
  });
  appContainer.register(DefaultMcpClientConnector, {
    useClass: DefaultMcpClientConnector,
  });
  appContainer.register(ConnectionManager, { useClass: ConnectionManager });
  return appContainer;
}
