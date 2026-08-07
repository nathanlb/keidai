import type { K8sSaOidcSubjectConfig } from "../types/k8s-sa-oidc-subject-config.js";
import { parseK8sSaSubjectMappings } from "./parse-k8s-sa-subject-mappings.js";

function readEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

/**
 * Resolves `FUDA_K8S_SA_OIDC_*`: all unset → null; any subset → throw;
 * all set (issuer, audience, jwks, subject mappings) → config.
 */
export function tryResolveK8sSaOidcSubjectConfig(
  env: NodeJS.ProcessEnv = process.env,
): K8sSaOidcSubjectConfig | null {
  const issuer = readEnv(env, "FUDA_K8S_SA_OIDC_ISSUER");
  const audience = readEnv(env, "FUDA_K8S_SA_OIDC_AUDIENCE");
  const jwksUri = readEnv(env, "FUDA_K8S_SA_OIDC_JWKS_URI");
  const mappingsOrError = parseK8sSaSubjectMappings(
    env.FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS,
  );

  if (typeof mappingsOrError === "string") {
    throw new Error(mappingsOrError);
  }

  const mappings = mappingsOrError;
  const anySet = Boolean(issuer || audience || jwksUri || mappings);
  if (!anySet) {
    return null;
  }

  if (!issuer || !audience || !jwksUri || !mappings) {
    throw new Error(
      "K8s SA OIDC is partially configured; set FUDA_K8S_SA_OIDC_ISSUER, FUDA_K8S_SA_OIDC_AUDIENCE, FUDA_K8S_SA_OIDC_JWKS_URI, and FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS together",
    );
  }

  const jwksBearerTokenFile = readEnv(
    env,
    "FUDA_K8S_SA_OIDC_JWKS_BEARER_TOKEN_FILE",
  );

  return {
    issuer,
    audience,
    jwksUri,
    mappings,
    ...(jwksBearerTokenFile ? { jwksBearerTokenFile } : {}),
  };
}
