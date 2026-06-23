import type { AgentSubjectConfig } from "@keidai/shared";

/** Credential metadata exposed to the UI — no secret values. */
export type PublicCredentialConfig =
  | { strategy: "user_oauth"; provider: string }
  | { strategy: "service_key" }
  | { strategy: "none" };

export interface PublicServerConfig {
  name: string;
  transport: { type: "http"; url: string };
  credential: PublicCredentialConfig;
}

/** OAuth provider metadata exposed to the UI — no client_secret. */
export interface PublicOAuthProviderConfig {
  token_url: string;
  authorize_url?: string;
  client_id?: string;
  scopes: string[];
  redirect_uri?: string;
  registration_endpoint?: string;
  authorize_params?: Record<string, string>;
  token_client_auth?: "body" | "basic";
  token_body_format?: "form" | "json";
  pkce?: boolean;
}

export interface PublicAgentConfig {
  agent_id: string;
  owner_id: string;
  subject: AgentSubjectConfig;
  groups: string[];
}

export interface ConfigServersResponse {
  servers: PublicServerConfig[];
}

export interface ConfigOAuthProvidersResponse {
  providers: Record<string, PublicOAuthProviderConfig>;
}

export interface ConfigAgentsResponse {
  agents: PublicAgentConfig[];
}
