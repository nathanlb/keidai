import type {
  ConnectorOAuthOverride,
  ConnectorRecord,
  PublicConnector,
  SecretHint,
} from "@keidai/shared";

export function projectPublicConnector(
  connector: ConnectorRecord,
  options: { oauthClient?: SecretHint & { issuer?: string; clientId?: string } } = {},
): PublicConnector {
  const serviceKey: PublicConnector["serviceKey"] =
    connector.authMode === "service_key"
      ? {
          set: Boolean(connector.serviceKeyRef || connector.resolvedServiceKey),
          ...(connector.serviceKeyHeader
            ? { header: connector.serviceKeyHeader }
            : {}),
        }
      : undefined;
  return {
    slug: connector.slug,
    displayName: connector.displayName,
    url: connector.url,
    transportType: connector.transportType,
    authMode: connector.authMode,
    enabled: connector.enabled,
    ...(connector.catalogId ? { catalogId: connector.catalogId } : {}),
    ...(connector.catalogVersion
      ? { catalogVersion: connector.catalogVersion }
      : {}),
    ...(connector.icon ? { icon: connector.icon } : {}),
    ...(serviceKey ? { serviceKey } : {}),
    ...(options.oauthClient ? { oauthClient: options.oauthClient } : {}),
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
  };
}

export function overrideWithoutSecret(
  oauth: ConnectorOAuthOverride,
): ConnectorOAuthOverride {
  const { clientSecret: _secret, ...rest } = oauth;
  return rest;
}
