import type { OperatorEntry, OperatorPrincipal } from "@keidai/shared";

export type { OperatorPrincipal };

declare module "fastify" {
  interface FastifyRequest {
    /** Set by operator auth `onRequest` after a valid session cookie. */
    operatorPrincipal?: OperatorPrincipal;
  }
}

export interface OperatorAuthConfig {
  googleClientId: string;
  googleClientSecret: string;
  redirectUri: string;
  /** Symmetric secret used to seal session / OIDC state cookies (≥32 chars). */
  sessionSecret: string;
  /** Google ↔ owner_id registry (from operators.yaml). */
  operators: readonly OperatorEntry[];
  cookieSecure: boolean;
  /** Cookie max-age for the sealed operator session (seconds). Default 7d. */
  sessionMaxAgeSeconds?: number;
  googleAuthorizationEndpoint?: string;
  googleTokenEndpoint?: string;
  googleJwksUri?: string;
  googleIssuer?: string;
  /**
   * Test seam: skip the live Google token + JWKS round-trip and return claims
   * directly from the authorization code (or a canned principal).
   */
  exchangeAuthorizationCode?: (
    code: string,
    codeVerifier: string,
  ) => Promise<{
    googleSub: string;
    email: string;
    name?: string;
    picture?: string;
  }>;
}

export interface OidcPendingState {
  state: string;
  codeVerifier: string;
}

export const OPERATOR_SESSION_COOKIE = "keidai_operator_session";
export const OPERATOR_OIDC_STATE_COOKIE = "keidai_oidc_state";

export const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
