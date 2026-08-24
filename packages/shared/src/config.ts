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
  gated?: string[];
}

/** Tool grants a group confers on one backend server. */
export interface GroupPermissionConfig {
  server: string;
  tools: string[];
}

/**
 * Operator-defined group: Torii's RBAC vocabulary.
 * Fuda assigns group names to agents; Torii defines what each grants.
 */
export interface GroupDefinitionConfig {
  name: string;
  description: string;
  permissions: GroupPermissionConfig[];
}

export interface ServerConfig {
  name: string;
  transport: { type: "http"; url: string };
  credential: CredentialConfig;
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
  /**
   * Group definitions — the allow source for tool policy.
   * A principal group absent from this list fails closed (grants nothing).
   */
  groups?: GroupDefinitionConfig[];
  /**
   * Namespaced tools that require human approval before Torii proxies upstream,
   * keyed by Fuda agent id. Operator-owned policy — not agent identity data.
   */
  gated_tools?: Record<string, string[]>;
}
