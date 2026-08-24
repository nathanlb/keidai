import type {
  GroupDefinitionConfig,
  PolicyConfig,
} from "../config.js";

/** Credential metadata exposed to the UI — no secret values. */
export type PublicCredentialConfig =
  | { strategy: "user_oauth"; provider: string }
  | { strategy: "service_key"; inject?: { header: string } }
  | { strategy: "none" };

export interface PublicServerConfig {
  name: string;
  transport: { type: "http"; url: string };
  credential: PublicCredentialConfig;
  /**
   * Derived projection of group policy on this server: union of explicit
   * allow/deny/gated lists, and `default: "allow"` when any group defaults
   * to allow. Live evaluation is still keyed on the principal's groups.
   */
  policy: PolicyConfig;
}

/** Group definition exposed for authoring soft-join (name + description). */
export type PublicGroupDefinition = Pick<
  GroupDefinitionConfig,
  "name" | "description"
>;

/** OAuth provider metadata exposed to the UI — no client_secret. */
export interface PublicOAuthProviderConfig {
  token_url: string;
  authorize_url?: string;
  client_id?: string;
  scopes: string[];
  registration_endpoint?: string;
  authorize_params?: Record<string, string>;
  token_client_auth?: "body" | "basic";
  token_body_format?: "form" | "json";
  pkce?: boolean;
}

/** Response body for `GET /api/config/servers`. */
export interface ConfigServersResponse {
  servers: PublicServerConfig[];
}

/** Response body for `GET /api/config/oauth-providers`. */
export interface ConfigOAuthProvidersResponse {
  providers: Record<string, PublicOAuthProviderConfig>;
}

/** Response body for `GET /api/config/groups`. */
export interface ConfigGroupsResponse {
  groups: PublicGroupDefinition[];
}
