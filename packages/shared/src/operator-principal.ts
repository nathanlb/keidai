/**
 * Operator identity established by the keidai-ui BFF after Google OIDC login.
 * Returned by `GET /api/session` and stored in the sealed session cookie.
 *
 * `ownerId` is the opaque platform owner. Display fields come from the IdP
 * at login. Fuda stores the owner record; operators.yaml is only an optional
 * allowlist.
 */
export interface OperatorPrincipal {
  googleSub: string;
  email: string;
  /** Opaque platform owner id, not the IdP subject. */
  ownerId: string;
  /** Google profile display name when present on the ID token. */
  name?: string;
  /** Google profile picture URL when present on the ID token. */
  picture?: string;
}
