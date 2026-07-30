import type { StaticSubjectConfig } from "./static-subject-config.js";
import type { K8sSaOidcSubjectConfig } from "./k8s-sa-oidc-subject-config.js";

/**
 * Discriminated selection of which subject-token validator to construct.
 * A second kind can be added without changing the token endpoint.
 */
export type SubjectTokenValidatorConfig =
  | ({ kind: "static" } & StaticSubjectConfig)
  | ({ kind: "k8s_sa_oidc" } & K8sSaOidcSubjectConfig);

/**
 * Public runtime surface: which validator is selected, without
 * validator-private credential material (static mappings, etc.).
 */
export type SubjectTokenValidatorSelection = {
  kind: SubjectTokenValidatorConfig["kind"];
};
