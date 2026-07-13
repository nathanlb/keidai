export interface K8sSaOidcConfig {
  issuer: string;
  audience: string | string[];
  jwksUri: string;
}
