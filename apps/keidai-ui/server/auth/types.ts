import type {
  OperatorEntry,
  OperatorPrincipal,
  OperatorRole,
} from "@keidai/shared";

export type { OperatorPrincipal };

export interface ProvisionOwnerRequest {
  idpIssuer: string;
  idpSub: string;
  email: string;
  displayName?: string;
  pictureUrl?: string;
  /** Pre-seeded owner id from operators.yaml, when the account is allowlisted. */
  ownerId?: string;
  /** Role hint from operators.yaml. Fuda promotes the first owner when omitted. */
  role?: OperatorRole;
}

export type ProvisionOwnerResult =
  | { ok: true; ownerId: string; role?: OperatorRole }
  | { ok: false; reason: "disabled" };

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
  /**
   * Optional Google ↔ owner_id allowlist (from operators.yaml).
   * Empty means any account the IdP accepts may be provisioned.
   */
  operators: readonly OperatorEntry[];
  cookieSecure: boolean;
  /** Cookie max-age for the sealed operator session (seconds). Default 7d. */
  sessionMaxAgeSeconds?: number;
  /** OIDC issuer. Defaults to Google when unset. */
  issuer?: string;
  googleAuthorizationEndpoint?: string;
  googleTokenEndpoint?: string;
  googleJwksUri?: string;
  googleIssuer?: string;
  /** Lowercased email domains. Empty or unset means no domain check. */
  allowedEmailDomains?: readonly string[];
  /**
   * Creates or resolves the Fuda owner for this login.
   * When omitted, login uses the operators allowlist only.
   */
  provisionOwner?: (
    input: ProvisionOwnerRequest,
  ) => Promise<ProvisionOwnerResult>;
  /**
   * Session re-check. Disabled or missing owners fail closed.
   * When omitted, only the operators allowlist is re-checked.
   */
  isOwnerActive?: (ownerId: string) => Promise<boolean>;
  /**
   * Live owner status and role. When set, this replaces `isOwnerActive`
   * and `GET /api/session` reflects role changes within the client cache TTL.
   */
  getOwnerAccess?: (
    ownerId: string,
  ) => Promise<{ active: boolean; role: OperatorRole }>;
  /**
   * Test seam: skip the live IdP token + JWKS round-trip and return claims
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
    hd?: string;
  }>;
}

export interface OidcPendingState {
  state: string;
  codeVerifier: string;
}

export const OPERATOR_SESSION_COOKIE = "keidai_operator_session";
export const OPERATOR_OIDC_STATE_COOKIE = "keidai_oidc_state";

export const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
