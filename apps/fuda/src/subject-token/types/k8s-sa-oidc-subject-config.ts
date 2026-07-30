/**
 * Config shape for the k8s SA OIDC subject validator (NAT-118).
 * Resolved here so selection can fail-fast on partial / ambiguous env
 * before the validator implementation lands.
 */
export interface K8sSaOidcSubjectConfig {
  issuer: string;
  audience: string;
  jwksUri: string;
}
