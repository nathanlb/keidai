import type {
  AgentRegistrationConfig,
  ConfigAgentsResponse,
  ConfigGroupsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  CredentialConfig,
  GroupDefinitionConfig,
  OAuthProviderConfig,
  PolicyConfig,
  PublicAgentConfig,
  PublicCredentialConfig,
  PublicGroupDefinition,
  PublicOAuthProviderConfig,
  PublicServerConfig,
  ServerConfig,
  ToriiConfig,
} from "@keidai/shared";

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

/** Union of tools any group grants on a server — UI allow-list projection. */
export function deriveServerPolicy(
  groups: readonly GroupDefinitionConfig[],
  serverName: string,
): PolicyConfig {
  const allow = new Set<string>();
  for (const group of groups) {
    for (const permission of group.permissions) {
      if (permission.server !== serverName) {
        continue;
      }
      for (const tool of permission.tools) {
        allow.add(tool);
      }
    }
  }
  return { default: "deny", allow: [...allow].sort() };
}

export function projectPublicServer(
  server: ServerConfig,
  groups: readonly GroupDefinitionConfig[] = [],
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

export function projectPublicAgent(
  agent: AgentRegistrationConfig,
): PublicAgentConfig {
  return {
    agent_id: agent.agent_id,
    owner_id: agent.owner_id,
    subject: agent.subject,
    groups: agent.groups,
  };
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
  const groups = config.groups ?? [];
  return {
    servers: config.servers.map((server) =>
      projectPublicServer(server, groups),
    ),
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

export function projectConfigAgents(config: ToriiConfig): ConfigAgentsResponse {
  return {
    agents: (config.agents ?? []).map(projectPublicAgent),
  };
}

export function projectConfigGroups(config: ToriiConfig): ConfigGroupsResponse {
  return {
    groups: (config.groups ?? []).map(projectPublicGroup),
  };
}
