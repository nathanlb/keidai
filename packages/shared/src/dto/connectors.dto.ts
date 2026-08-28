import type { ConnectorAuthMode } from "../connector.js";
import type { CatalogEntry } from "../connector-catalog.js";

export interface SecretHint {
  set: boolean;
  hint?: string;
}

export interface PublicConnector {
  slug: string;
  displayName: string;
  url: string;
  transportType: "http";
  authMode: ConnectorAuthMode;
  enabled: boolean;
  catalogId?: string;
  catalogVersion?: string;
  icon?: string;
  serviceKey?: SecretHint & { header?: string };
  oauthClient?: SecretHint & { issuer?: string; clientId?: string };
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorsResponse {
  connectors: PublicConnector[];
}

export interface ConnectorResponse {
  connector: PublicConnector;
}

export interface CreateConnectorRequest {
  slug: string;
  displayName: string;
  url: string;
  authMode: ConnectorAuthMode;
  icon?: string;
  serviceKey?: string;
  serviceKeyHeader?: string;
  serviceKeyEnvRef?: string;
  oauth?: {
    issuer?: string;
    authorizeUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    clientId?: string;
    clientSecret?: string;
    authorizeParams?: Record<string, string>;
  };
}

export interface UpdateConnectorRequest {
  displayName?: string;
  url?: string;
  enabled?: boolean;
  icon?: string;
  serviceKey?: string | null;
  serviceKeyHeader?: string;
  serviceKeyEnvRef?: string;
  oauth?: CreateConnectorRequest["oauth"] | null;
}

export interface InstallCatalogConnectorRequest {
  catalogId: string;
  slug?: string;
  serviceKey?: string;
  serviceKeyEnvRef?: string;
  oauthClient?: {
    clientId: string;
    clientSecret: string;
  };
}

export interface CatalogConnectorsResponse {
  catalog: CatalogEntry[];
  version: string;
}
