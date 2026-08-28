/** Auth mode stored on a connector row. */
export type ConnectorAuthMode = "user_oauth" | "service_key" | "none";

/** Origin of an OAuth client registration. */
export type OAuthRegistrationOrigin = "dcr" | "manual" | "cimd";

/** Optional OAuth endpoint override (catalog Class B, YAML import, tests). */
export interface ConnectorOAuthOverride {
  /** Token-store key when it differs from the connector slug (YAML import). */
  providerKey?: string;
  issuer?: string;
  tokenUrl?: string;
  authorizeUrl?: string;
  scopes?: string[];
  clientId?: string;
  clientSecret?: string;
  registrationEndpoint?: string;
  authorizeParams?: Record<string, string>;
}

/**
 * In-memory connector. `resolvedServiceKey` / `oauth.clientSecret` are never
 * serialized on the public API.
 */
export interface ConnectorRecord {
  slug: string;
  displayName: string;
  url: string;
  transportType: "http";
  authMode: ConnectorAuthMode;
  enabled: boolean;
  catalogId?: string;
  catalogVersion?: string;
  icon?: string;
  serviceKeyRef?: string;
  serviceKeyHeader?: string;
  resolvedServiceKey?: string;
  oauth?: ConnectorOAuthOverride;
  createdAt: string;
  updatedAt: string;
}

export const CONNECTOR_SLUG_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
