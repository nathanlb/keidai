/**
 * Operator identity established by the keidai-ui BFF after Google OIDC login.
 * Returned by `GET /api/session` and stored in the sealed session cookie.
 */
export interface OperatorPrincipal {
  googleSub: string;
  email: string;
  /** v0 single-owner id (from `KEIDAI_OWNER_ID`), not the raw Google `sub`. */
  ownerId: string;
}
