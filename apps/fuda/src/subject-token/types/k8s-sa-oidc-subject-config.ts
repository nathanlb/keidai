/**
 * Config for the k8s SA OIDC subject validator.
 * Subject → `bearer_id` mappings are validator-private (not schema).
 */
export interface K8sSaOidcSubjectConfig {
  issuer: string;
  audience: string;
  jwksUri: string;
  /** `registryKey(subject)` → internal bearer_id. */
  mappings: ReadonlyMap<string, string>;
}
