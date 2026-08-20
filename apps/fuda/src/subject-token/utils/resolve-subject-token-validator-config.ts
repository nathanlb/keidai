import type { SubjectTokenValidatorConfig } from "../types/subject-token-validator-config.js";
import { parseStaticSubjectTokens } from "./parse-static-subject-tokens.js";
import { tryResolveK8sSaOidcSubjectConfig } from "./try-resolve-k8s-sa-oidc-subject-config.js";

function rejectRemovedMappingEnv(env: NodeJS.ProcessEnv): void {
  if (env.FUDA_STATIC_SUBJECT_MAPPINGS?.trim()) {
    throw new Error(
      "FUDA_STATIC_SUBJECT_MAPPINGS is removed; set FUDA_STATIC_SUBJECT_TOKEN to the shared secret (comma-list for rotation). Allowed subjects resolve to shaiden-runner",
    );
  }
  if (env.FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS?.trim()) {
    throw new Error(
      "FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS is removed; set FUDA_K8S_SA_OIDC_SUBJECTS to namespace/serviceAccount (no =bearer_id). Allowed subjects resolve to shaiden-runner",
    );
  }
}

/**
 * Like {@link resolveSubjectTokenValidatorConfig}, but returns `null` when
 * no subject-token env is set (instead of throwing). Still fails on partial
 * or ambiguous configuration.
 */
export function tryResolveSubjectTokenValidatorConfig(
  env: NodeJS.ProcessEnv = process.env,
): SubjectTokenValidatorConfig | null {
  rejectRemovedMappingEnv(env);

  const tokensOrError = parseStaticSubjectTokens(env.FUDA_STATIC_SUBJECT_TOKEN);
  if (typeof tokensOrError === "string") {
    throw new Error(tokensOrError);
  }

  const k8sConfig = tryResolveK8sSaOidcSubjectConfig(env);

  if (tokensOrError && k8sConfig) {
    throw new Error(
      "Ambiguous subject token validator configuration: set either FUDA_STATIC_SUBJECT_TOKEN or FUDA_K8S_SA_OIDC_* , not both",
    );
  }

  if (tokensOrError) {
    return { kind: "static", tokens: tokensOrError };
  }

  if (k8sConfig) {
    return { kind: "k8s_sa_oidc", ...k8sConfig };
  }

  return null;
}

/**
 * Selects exactly one subject-token validator from env.
 *
 * Fail-fast rules (mirrors Torii `resolveK8sSaOidcConfig`):
 * - A config group that is only partially set → error
 * - More than one complete group → ambiguous error
 * - No group set → error
 */
export function resolveSubjectTokenValidatorConfig(
  env: NodeJS.ProcessEnv = process.env,
): SubjectTokenValidatorConfig {
  const config = tryResolveSubjectTokenValidatorConfig(env);
  if (!config) {
    throw new Error(
      "No subject token validator configured; set FUDA_STATIC_SUBJECT_TOKEN (or FUDA_K8S_SA_OIDC_* together)",
    );
  }
  return config;
}
