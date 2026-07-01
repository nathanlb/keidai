/** OAuth link status reported to the UI (no token values). */
export type OAuthLinkStatus =
  | "not_linked"
  | "pending"
  | "linked"
  | "expired"
  | "failed";

export interface OAuthConnectionStatus {
  provider: string;
  ownerId: string;
  status: OAuthLinkStatus;
  scopes: string[];
  expiresAt?: string;
  error?: string;
}

/** Response body for `GET /api/oauth/connections`. */
export interface OAuthConnectionsResponse {
  connections: OAuthConnectionStatus[];
}

/** Response body for `POST /api/oauth/initiate/:provider`. */
export interface OAuthInitiateResponse {
  authorizationUrl: string;
  linkId: string;
  redirectUri: string;
}
