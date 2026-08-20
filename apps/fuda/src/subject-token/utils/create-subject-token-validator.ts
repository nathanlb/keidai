import type { SubjectTokenValidatorConfig } from "../types/subject-token-validator-config.js";
import type { SubjectTokenValidator } from "../types/subject-token-validator.js";
import { K8sSaOidcSubjectValidator } from "../validators/k8s-sa-oidc-subject-validator.js";
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
      return new StaticSubjectValidator({ tokens: config.tokens });
    case "k8s_sa_oidc":
      return new K8sSaOidcSubjectValidator({
        issuer: config.issuer,
        audience: config.audience,
        jwksUri: config.jwksUri,
        subjects: config.subjects,
        jwksBearerTokenFile: config.jwksBearerTokenFile,
      });
  }
}
