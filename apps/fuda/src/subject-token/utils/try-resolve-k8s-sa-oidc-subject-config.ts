import type { K8sSaOidcSubjectConfig } from "../types/k8s-sa-oidc-subject-config.js";
import { parseK8sSaSubjects } from "./parse-k8s-sa-subjects.js";

function readEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

/**
 * Resolves `FUDA_K8S_SA_OIDC_*`: all unset → null; any subset → throw;
 * audience + jwks + subjects set → config (issuer optional; discovered at boot).
 */
export function tryResolveK8sSaOidcSubjectConfig(
  env: NodeJS.ProcessEnv = process.env,
): K8sSaOidcSubjectConfig | null {
  const issuer = readEnv(env, "FUDA_K8S_SA_OIDC_ISSUER");
  const audience = readEnv(env, "FUDA_K8S_SA_OIDC_AUDIENCE");
  const jwksUri = readEnv(env, "FUDA_K8S_SA_OIDC_JWKS_URI");
  const subjectsOrError = parseK8sSaSubjects(env.FUDA_K8S_SA_OIDC_SUBJECTS);

  if (typeof subjectsOrError === "string") {
    throw new Error(subjectsOrError);
  }

  const subjects = subjectsOrError;
  const anySet = Boolean(issuer || audience || jwksUri || subjects);
  if (!anySet) {
    return null;
  }

  // Issuer may be omitted: Fuda discovers it in-cluster at boot.
  if (!audience || !jwksUri || !subjects) {
    throw new Error(
      "K8s SA OIDC is partially configured; set FUDA_K8S_SA_OIDC_AUDIENCE, FUDA_K8S_SA_OIDC_JWKS_URI, and FUDA_K8S_SA_OIDC_SUBJECTS together (FUDA_K8S_SA_OIDC_ISSUER is optional and discovered in-cluster when omitted)",
    );
  }

  const jwksBearerTokenFile = readEnv(
    env,
    "FUDA_K8S_SA_OIDC_JWKS_BEARER_TOKEN_FILE",
  );

  return {
    // Empty issuer → discoverClusterOidcIssuer before constructing the validator.
    issuer: issuer ?? "",
    audience,
    jwksUri,
    subjects,
    ...(jwksBearerTokenFile ? { jwksBearerTokenFile } : {}),
  };
}
