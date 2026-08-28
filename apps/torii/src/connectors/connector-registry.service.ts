import type {
  ConnectorRecord,
  ServerConfig,
  ToriiConfig,
} from "@keidai/shared";
import {
  connectorsFromConfig,
  oauthProvidersFromConnectors,
  toServerConfig,
} from "./utils/connector-config.js";

/** In-memory snapshot of connectors. Replaced on every management write. */
export class ConnectorRegistry {
  constructor(private connectors: ConnectorRecord[] = []) {}

  static fromConfig(config: ToriiConfig): ConnectorRegistry {
    return new ConnectorRegistry(connectorsFromConfig(config));
  }

  static fromConnectors(
    connectors: readonly ConnectorRecord[],
  ): ConnectorRegistry {
    return new ConnectorRegistry([...connectors]);
  }

  get(): readonly ConnectorRecord[] {
    return this.connectors;
  }

  listEnabled(): ConnectorRecord[] {
    return this.connectors.filter((connector) => connector.enabled);
  }

  find(slug: string): ConnectorRecord | undefined {
    return this.connectors.find((connector) => connector.slug === slug);
  }

  listServers(): ServerConfig[] {
    return this.listEnabled().map(toServerConfig);
  }

  toServerConfig(slug: string): ServerConfig | undefined {
    const connector = this.find(slug);
    if (!connector || !connector.enabled) {
      return undefined;
    }
    return toServerConfig(connector);
  }

  oauthProviders(): ToriiConfig["oauth_providers"] {
    return oauthProvidersFromConnectors(this.connectors);
  }

  replace(connectors: readonly ConnectorRecord[]): void {
    this.connectors = [...connectors];
  }
}
