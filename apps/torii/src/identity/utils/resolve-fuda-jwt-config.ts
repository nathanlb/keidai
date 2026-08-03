import type { FudaJwtConfig } from "../types/fuda-jwt-config.js";

/**
 * Resolve Fuda JWT validation config from env.
 * Both vars are required — Torii has exactly one identity resolver.
 */
export function resolveFudaJwtConfig(
  env: NodeJS.ProcessEnv = process.env,
): FudaJwtConfig {
  const issuer = env.TORII_FUDA_ISSUER?.trim() || undefined;
  const jwksUri = env.TORII_FUDA_JWKS_URI?.trim() || undefined;

  if (!issuer && !jwksUri) {
    throw new Error(
      "Missing Fuda JWT configuration (TORII_FUDA_ISSUER, TORII_FUDA_JWKS_URI)",
    );
  }

  if (!issuer || !jwksUri) {
    throw new Error(
      "Fuda JWT is partially configured; set TORII_FUDA_ISSUER and TORII_FUDA_JWKS_URI together",
    );
  }

  try {
    new URL(issuer);
  } catch {
    throw new Error(`Invalid TORII_FUDA_ISSUER: ${issuer}`);
  }

  try {
    new URL(jwksUri);
  } catch {
    throw new Error(`Invalid TORII_FUDA_JWKS_URI: ${jwksUri}`);
  }

  return { issuer, jwksUri };
}
