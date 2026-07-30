import type { K8sSaOidcSubjectConfig } from "../types/k8s-sa-oidc-subject-config.js";

function readEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

/**
 * Resolves `FUDA_K8S_SA_OIDC_*` the same way Torii's
 * `tryResolveK8sSaOidcConfig` does: all unset → null; any subset → throw;
 * all set → config. Validator implementation is NAT-118.
 */
export function tryResolveK8sSaOidcSubjectConfig(
  env: NodeJS.ProcessEnv = process.env,
): K8sSaOidcSubjectConfig | null {
  const issuer = readEnv(env, "FUDA_K8S_SA_OIDC_ISSUER");
  const audience = readEnv(env, "FUDA_K8S_SA_OIDC_AUDIENCE");
  const jwksUri = readEnv(env, "FUDA_K8S_SA_OIDC_JWKS_URI");

  if (!issuer && !audience && !jwksUri) {
    return null;
  }

  if (!issuer || !audience || !jwksUri) {
    throw new Error(
      "K8s SA OIDC is partially configured; set FUDA_K8S_SA_OIDC_ISSUER, FUDA_K8S_SA_OIDC_AUDIENCE, and FUDA_K8S_SA_OIDC_JWKS_URI together",
    );
  }

  return { issuer, audience, jwksUri };
}
