import type {
  ConfigGroupsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  CredentialConfig,
  GroupDefinitionConfig,
  OAuthProviderConfig,
  PolicyConfig,
  PublicCredentialConfig,
  PublicGroupDefinition,
  PublicOAuthProviderConfig,
  PublicServerConfig,
  ServerConfig,
  ToriiConfig,
} from "@keidai/shared";
import type { GroupPolicySnapshot } from "../../policy/types/group-policy.js";

export function projectPublicCredential(
  credential: CredentialConfig,
): PublicCredentialConfig {
  switch (credential.strategy) {
    case "user_oauth":
      return { strategy: "user_oauth", provider: credential.provider };
    case "service_key":
      return credential.inject
        ? { strategy: "service_key", inject: credential.inject }
        : { strategy: "service_key" };
    case "none":
      return { strategy: "none" };
  }
}

/** Union of tools any group lists under `allow` on a server. */
export function deriveServerPolicy(
  groups: readonly GroupPolicySnapshot[],
  serverName: string,
): PolicyConfig {
  const allow = new Set<string>();
  for (const group of groups) {
    for (const policy of group.servers) {
      if (policy.server !== serverName) {
        continue;
      }
      for (const tool of policy.allow) {
        allow.add(tool);
      }
    }
  }
  return { default: "deny", allow: [...allow].sort() };
}

export function projectPublicServer(
  server: ServerConfig,
  groups: readonly GroupPolicySnapshot[] = [],
): PublicServerConfig {
  return {
    name: server.name,
    transport: server.transport,
    credential: projectPublicCredential(server.credential),
    policy: deriveServerPolicy(groups, server.name),
  };
}

export function projectPublicOAuthProvider(
  provider: OAuthProviderConfig,
): PublicOAuthProviderConfig {
  const { client_secret: _clientSecret, ...publicProvider } = provider;
  return publicProvider;
}

export function projectPublicGroup(
  group: GroupDefinitionConfig,
): PublicGroupDefinition {
  return {
    name: group.name,
    description: group.description,
  };
}

export function projectConfigServers(
  config: ToriiConfig,
): ConfigServersResponse {
  return {
    servers: config.servers.map((server) => projectPublicServer(server)),
  };
}

export function projectConfigOAuthProviders(
  config: ToriiConfig,
): ConfigOAuthProvidersResponse {
  const providers: Record<string, PublicOAuthProviderConfig> = {};
  for (const [name, provider] of Object.entries(config.oauth_providers)) {
    providers[name] = projectPublicOAuthProvider(provider);
  }
  return { providers };
}

export function projectConfigGroups(config: ToriiConfig): ConfigGroupsResponse {
  return {
    groups: (config.groups ?? []).map(projectPublicGroup),
  };
}
