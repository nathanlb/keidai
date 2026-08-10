/**
 * Operator identity established by the keidai-ui BFF after Google OIDC login.
 * Returned by `GET /api/session` and stored in the sealed session cookie.
 *
 * `ownerId` is the opaque platform owner (from operators.yaml). Display fields
 * (`email`, `name`, `picture`) come from Google IdP claims.
 */
export interface OperatorPrincipal {
  googleSub: string;
  email: string;
  /** Opaque platform owner id (operators.yaml), not the raw Google `sub`. */
  ownerId: string;
  /** Google profile display name when present on the ID token. */
  name?: string;
  /** Google profile picture URL when present on the ID token. */
  picture?: string;
}
