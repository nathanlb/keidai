import { IdentityResolutionError } from "../types/identity-resolution-error.js";

export function extractBearerCredential(
  authorization: string | string[] | undefined,
): string {
  const header = Array.isArray(authorization)
    ? authorization[0]
    : authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new IdentityResolutionError("Missing or invalid Authorization header");
  }

  const credential = header.slice("Bearer ".length).trim();
  if (!credential) {
    throw new IdentityResolutionError("Missing or invalid Authorization header");
  }

  return credential;
}
