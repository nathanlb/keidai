/**
 * Config for validating Fuda-minted agent identity JWTs.
 * Audience is fixed to `torii` (Fuda's TOKEN_EXCHANGE_AUDIENCE).
 */
export interface FudaJwtConfig {
  /** Expected `iss` claim — must match Fuda's `FUDA_ISSUER`. */
  issuer: string;
  /** Fuda JWKS URL, typically `http://…/.well-known/jwks.json`. */
  jwksUri: string;
}
