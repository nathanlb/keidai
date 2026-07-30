import { K8S_SA_OIDC_SUBJECT_VALIDATOR_NOT_IMPLEMENTED } from "../k8s-sa-oidc-not-implemented.js";
import type { SubjectTokenValidatorConfig } from "../types/subject-token-validator-config.js";
import type { SubjectTokenValidator } from "../types/subject-token-validator.js";
import { StaticSubjectValidator } from "../validators/static-subject-validator.js";

/**
 * Builds the selected {@link SubjectTokenValidator}. Adding a kind only
 * changes this switch — not the token endpoint or grant check.
 */
export function createSubjectTokenValidator(
  config: SubjectTokenValidatorConfig,
): SubjectTokenValidator {
  switch (config.kind) {
    case "static":
      return new StaticSubjectValidator({ mappings: config.mappings });
    case "k8s_sa_oidc":
      throw new Error(K8S_SA_OIDC_SUBJECT_VALIDATOR_NOT_IMPLEMENTED);
  }
}
