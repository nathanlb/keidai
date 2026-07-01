export interface OAuthProviderClient {
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface OAuthClientRepository {
  get(provider: string): Promise<OAuthProviderClient | null>;
  set(provider: string, client: OAuthProviderClient): Promise<void>;
}

export const OAUTH_CLIENT_REPOSITORY = Symbol("OAUTH_CLIENT_REPOSITORY");
