import type {
  ConnectorOAuthOverride,
  ConnectorRecord,
  CredentialConfig,
  ServerConfig,
  ToriiConfig,
} from "@keidai/shared";

export function toServerConfig(connector: ConnectorRecord): ServerConfig {
  return {
    name: connector.slug,
    transport: { type: "http", url: connector.url },
    credential: toCredentialConfig(connector),
  };
}

function toCredentialConfig(connector: ConnectorRecord): CredentialConfig {
  switch (connector.authMode) {
    case "none":
      return { strategy: "none" };
    case "service_key":
      return {
        strategy: "service_key",
        key: connector.resolvedServiceKey ?? "",
        ...(connector.serviceKeyHeader
          ? { inject: { header: connector.serviceKeyHeader } }
          : {}),
      };
    case "user_oauth":
      return {
        strategy: "user_oauth",
        provider: connector.oauth?.providerKey ?? connector.slug,
      };
  }
}

function oauthOverrideFromProvider(
  providerName: string,
  provider: NonNullable<ToriiConfig["oauth_providers"][string]>,
): ConnectorOAuthOverride {
  return {
    providerKey: providerName,
    issuer: provider.token_url,
    tokenUrl: provider.token_url,
    authorizeUrl: provider.authorize_url,
    scopes: provider.scopes,
    clientId: provider.client_id,
    clientSecret: provider.client_secret,
    registrationEndpoint: provider.registration_endpoint,
    authorizeParams: provider.authorize_params,
  };
}

export function connectorsFromConfig(config: ToriiConfig): ConnectorRecord[] {
  const now = new Date(0).toISOString();
  const fromServers = config.servers.map((server) => {
    const providerKey =
      server.credential.strategy === "user_oauth"
        ? server.credential.provider
        : undefined;
    const oauth = providerKey
      ? config.oauth_providers[providerKey]
      : undefined;
    return {
      slug: server.name,
      displayName: server.name,
      url: server.transport.url,
      transportType: "http" as const,
      authMode: server.credential.strategy,
      enabled: true,
      resolvedServiceKey:
        server.credential.strategy === "service_key"
          ? server.credential.key
          : undefined,
      serviceKeyHeader:
        server.credential.strategy === "service_key"
          ? server.credential.inject?.header
          : undefined,
      oauth:
        oauth && providerKey
          ? oauthOverrideFromProvider(providerKey, oauth)
          : undefined,
      createdAt: now,
      updatedAt: now,
    };
  });

  const slugs = new Set(fromServers.map((connector) => connector.slug));
  const extras: ConnectorRecord[] = [];
  for (const [name, provider] of Object.entries(config.oauth_providers)) {
    if (slugs.has(name)) {
      continue;
    }
    extras.push({
      slug: name,
      displayName: name,
      url: "https://invalid.invalid/mcp",
      transportType: "http",
      authMode: "user_oauth",
      enabled: false,
      oauth: oauthOverrideFromProvider(name, provider),
      createdAt: now,
      updatedAt: now,
    });
  }

  return [...fromServers, ...extras];
}

export function oauthProvidersFromConnectors(
  connectors: readonly ConnectorRecord[],
): ToriiConfig["oauth_providers"] {
  const providers: ToriiConfig["oauth_providers"] = {};
  for (const connector of connectors) {
    if (connector.authMode !== "user_oauth") {
      continue;
    }
    const key = connector.oauth?.providerKey ?? connector.slug;
    if (providers[key]) {
      continue;
    }
    const oauth = connector.oauth;
    providers[key] = {
      token_url: oauth?.tokenUrl ?? oauth?.issuer ?? connector.url,
      authorize_url: oauth?.authorizeUrl,
      client_id: oauth?.clientId,
      client_secret: oauth?.clientSecret,
      scopes: oauth?.scopes ?? [],
      registration_endpoint: oauth?.registrationEndpoint,
      authorize_params: oauth?.authorizeParams,
    };
  }
  return providers;
}
