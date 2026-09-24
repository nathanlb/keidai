/** Audience Torii expects on Fuda-minted agent identity tokens. */
export const TOKEN_EXCHANGE_AUDIENCE = "torii";

/**
 * Audience the sandbox expects. Proves the caller is the platform bearer.
 * Distinct from `torii` so a sandbox token cannot call Torii and a Torii
 * token cannot call the sandbox.
 */
export const SANDBOX_TOKEN_AUDIENCE = "shaiden-sandbox";

export const TOKEN_EXCHANGE_AUDIENCES = [
  TOKEN_EXCHANGE_AUDIENCE,
  SANDBOX_TOKEN_AUDIENCE,
] as const;

/** Short TTL so revoked grants and group changes take effect within minutes. */
export const TOKEN_EXCHANGE_TTL_SECONDS = 300;
