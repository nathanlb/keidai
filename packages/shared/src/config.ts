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

/** Root torii.yaml shape — env refs are resolved before this type is populated. */
export interface ToriiConfig {
  oauth_providers: Record<string, OAuthProviderConfig>;
  servers: ServerConfig[];
}
