/** OAuth provider registered at the gateway level. */
export interface OAuthProviderConfig {
  token_url: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  /** OAuth redirect URI for the authorization-code link flow. */
  redirect_uri?: string;
}

export type CredentialConfig =
  | { strategy: "user_oauth"; provider: string }
  | {
      strategy: "service_key";
      key: string;
      inject?: { header: string };
    }
  | { strategy: "none" };

export interface PolicyConfig {
  default: "allow" | "deny";
  allow?: string[];
  deny?: string[];
}

export interface ServerConfig {
  name: string;
  transport: { type: "http"; url: string };
  credential: CredentialConfig;
  policy: PolicyConfig;
}

/** Workload identity a registered agent is bound to — not read from inbound requests. */
export type AgentSubjectConfig = {
  kind: "k8s_service_account";
  namespace: string;
  service_account: string;
};

/**
 * Boot-time agent registration. Binds a validated credential subject to an
 * internal principal; `owner_id` is fixed here and never taken from requests.
 */
export interface AgentRegistrationConfig {
  subject: AgentSubjectConfig;
  agent_id: string;
  owner_id: string;
  groups: string[];
}

/** Root torii.yaml shape — env refs are resolved before this type is populated. */
export interface ToriiConfig {
  oauth_providers: Record<string, OAuthProviderConfig>;
  servers: ServerConfig[];
  /** Boot-time agent registrations; omitted or empty when none are configured. */
  agents?: AgentRegistrationConfig[];
}
