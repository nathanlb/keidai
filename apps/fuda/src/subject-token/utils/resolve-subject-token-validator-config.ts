import type { SubjectTokenValidatorConfig } from "../types/subject-token-validator-config.js";
import { parseStaticSubjectMappings } from "./parse-static-subject-mappings.js";
import { tryResolveK8sSaOidcSubjectConfig } from "./try-resolve-k8s-sa-oidc-subject-config.js";

/**
 * Like {@link resolveSubjectTokenValidatorConfig}, but returns `null` when
 * no subject-token env is set (instead of throwing). Still fails on partial
 * or ambiguous configuration.
 */
export function tryResolveSubjectTokenValidatorConfig(
  env: NodeJS.ProcessEnv = process.env,
): SubjectTokenValidatorConfig | null {
  const staticOrError = parseStaticSubjectMappings(
    env.FUDA_STATIC_SUBJECT_MAPPINGS,
  );
  if (typeof staticOrError === "string") {
    throw new Error(staticOrError);
  }

  const k8sConfig = tryResolveK8sSaOidcSubjectConfig(env);

  if (staticOrError && k8sConfig) {
    throw new Error(
      "Ambiguous subject token validator configuration: set either FUDA_STATIC_SUBJECT_MAPPINGS or FUDA_K8S_SA_OIDC_* , not both",
    );
  }

  if (staticOrError) {
    return { kind: "static", mappings: staticOrError.mappings };
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
      "No subject token validator configured; set FUDA_STATIC_SUBJECT_MAPPINGS=credential=bearer_id,... (or FUDA_K8S_SA_OIDC_* together)",
    );
  }
  return config;
}
