/** OAuth provider registered at the gateway level. */
export interface OAuthProviderConfig {
  token_url: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
}

export type CredentialConfig =
  | { strategy: "oauth_obo"; provider: string; subject: string }
  | { strategy: "service_key"; key: string }
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
