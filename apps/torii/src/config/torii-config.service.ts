import { injectable } from "tsyringe";
import type { ServerConfig, ToriiConfig } from "@keidai/shared";
import { ConnectorRegistry } from "../connectors/connector-registry.service.js";

/**
 * Runtime view of gateway config. Production loads connectors from Postgres
 * into {@link ConnectorRegistry}; tests may pass a ToriiConfig literal.
 */
@injectable()
export class ToriiConfigService {
  private readonly registry: ConnectorRegistry;
  private readonly gatewayBaseUrl?: string;

  constructor(
    configOrRegistry: ToriiConfig | ConnectorRegistry,
    gatewayBaseUrl?: string,
  ) {
    if (configOrRegistry instanceof ConnectorRegistry) {
      this.registry = configOrRegistry;
      this.gatewayBaseUrl = gatewayBaseUrl;
    } else {
      this.registry = ConnectorRegistry.fromConfig(configOrRegistry);
      this.gatewayBaseUrl = configOrRegistry.gateway_base_url;
    }
  }

  getRegistry(): ConnectorRegistry {
    return this.registry;
  }

  get(): Readonly<ToriiConfig> {
    return {
      gateway_base_url: this.gatewayBaseUrl,
      oauth_providers: this.registry.oauthProviders(),
      servers: this.registry.listServers(),
    };
  }

  getServer(name: string): ServerConfig | undefined {
    return this.registry.toServerConfig(name);
  }
}
