/**
 * Config for the k8s SA OIDC subject validator.
 * Allowed SA subjects are validator-private (not schema).
 */
export interface K8sSaOidcSubjectConfig {
  /**
   * Expected JWT `iss`. Empty string means discover from the apiserver
   * well-known document at boot (`discoverClusterOidcIssuer`).
   */
  issuer: string;
  audience: string;
  jwksUri: string;
  /**
   * Path to a bearer token used when fetching JWKS. Defaults to the in-cluster
   * SA token. Many clusters require auth for `/openid/v1/jwks`.
   */
  jwksBearerTokenFile?: string;
  /** `registryKey(subject)` values Fuda will accept. */
  subjects: ReadonlySet<string>;
}
