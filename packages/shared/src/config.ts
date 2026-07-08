/** OAuth provider registered at the gateway level. */
export interface OAuthProviderConfig {
  token_url: string;
  /** Explicit authorize endpoint; derived from token_url when omitted. */
  authorize_url?: string;
  /** Static client credentials. Omitted when using registration_endpoint. */
  client_id?: string;
  client_secret?: string;
  scopes: string[];
  /** RFC 7591 dynamic client registration endpoint (e.g. Notion MCP). */
  registration_endpoint?: string;
  /** Extra static query params appended to the authorize URL. */
  authorize_params?: Record<string, string>;
  /** Send client credentials in an Authorization: Basic header. Default: body. */
  token_client_auth?: "body" | "basic";
  /** Token endpoint body encoding. Default: form. */
  token_body_format?: "form" | "json";
  /** Include PKCE on the authorize URL. Default: true. */
  pkce?: boolean;
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
  /**
   * Static bearer token this agent presents on inbound requests.
   * Env refs (e.g. ${env:DEMO_AGENT_BEARER}) are resolved at config load.
   * FOR DEMO USE.
   */
  inbound_token?: string;
  /** Namespaced tools that require human approval before Torii proxies upstream. */
  gated_tools?: string[];
}

/** Root torii.yaml shape — env refs are resolved before this type is populated. */
export interface ToriiConfig {
  /**
   * Public gateway base URL used for OAuth callback derivation
   * (`{gateway_base_url}/oauth/callback/{provider}`). When omitted, derived per
   * request from Host / X-Forwarded-* headers (local dev) or TORII_HOST/TORII_PORT.
   */
  gateway_base_url?: string;
  oauth_providers: Record<string, OAuthProviderConfig>;
  servers: ServerConfig[];
  /** Boot-time agent registrations; omitted or empty when none are configured. */
  agents?: AgentRegistrationConfig[];
}
