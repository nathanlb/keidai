import type {
  AgentRegistrationConfig,
  ConfigAgentsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  CredentialConfig,
  OAuthProviderConfig,
  PublicAgentConfig,
  PublicCredentialConfig,
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
      return { strategy: "service_key" };
    case "none":
      return { strategy: "none" };
  }
}

export function projectPublicServer(server: ServerConfig): PublicServerConfig {
  return {
    name: server.name,
    transport: server.transport,
    credential: projectPublicCredential(server.credential),
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

export function projectConfigServers(
  config: ToriiConfig,
): ConfigServersResponse {
  return {
    servers: config.servers.map(projectPublicServer),
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
