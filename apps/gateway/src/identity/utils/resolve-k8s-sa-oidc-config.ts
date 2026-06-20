import type { K8sSaOidcConfig } from "../types/k8s-sa-oidc-config.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function resolveK8sSaOidcConfig(): K8sSaOidcConfig {
  return {
    issuer: requiredEnv("TORII_K8S_SA_OIDC_ISSUER"),
    audience: requiredEnv("TORII_K8S_SA_OIDC_AUDIENCE"),
    jwksUri: requiredEnv("TORII_K8S_SA_OIDC_JWKS_URI"),
  };
}
