export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface StoredOAuthGrant {
  provider: string;
  token: OAuthToken;
}

export interface TokenRepository {
  get(ownerId: string, provider: string): Promise<OAuthToken | null>;
  set(ownerId: string, provider: string, token: OAuthToken): Promise<void>;
  delete(ownerId: string, provider: string): Promise<boolean>;
  listByOwner(ownerId: string): Promise<StoredOAuthGrant[]>;
}

/** tsyringe injection token for {@link TokenRepository}. */
export const TOKEN_REPOSITORY = Symbol("TokenRepository");
