export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface TokenRepository {
  get(subject: string, provider: string): Promise<OAuthToken | null>;
  set(subject: string, provider: string, token: OAuthToken): Promise<void>;
}
