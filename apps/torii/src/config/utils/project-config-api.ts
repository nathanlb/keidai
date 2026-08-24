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

/**
 * Display projection of every group's policy on one server.
 * Evaluation stays per-principal; this is what Connections shows.
 */
export function deriveServerPolicy(
  groups: readonly GroupPolicySnapshot[],
  serverName: string,
): PolicyConfig {
  const allow = new Set<string>();
  const deny = new Set<string>();
  const gated = new Set<string>();
  let defaultAllow = false;

  for (const group of groups) {
    for (const policy of group.servers) {
      if (policy.server !== serverName) {
        continue;
      }
      if (policy.default === "allow") {
        defaultAllow = true;
      }
      for (const tool of policy.allow) {
        allow.add(tool);
      }
      for (const tool of policy.deny) {
        deny.add(tool);
      }
      for (const tool of policy.gated) {
        gated.add(tool);
      }
    }
  }

  const derived: PolicyConfig = {
    default: defaultAllow ? "allow" : "deny",
    allow: [...allow].sort(),
  };
  if (deny.size > 0) {
    derived.deny = [...deny].sort();
  }
  if (gated.size > 0) {
    derived.gated = [...gated].sort();
  }
  return derived;
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
