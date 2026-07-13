import type { K8sSaOidcConfig } from "../types/k8s-sa-oidc-config.js";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function tryResolveK8sSaOidcConfig(): K8sSaOidcConfig | null {
  const issuer = readEnv("TORII_K8S_SA_OIDC_ISSUER");
  const audience = readEnv("TORII_K8S_SA_OIDC_AUDIENCE");
  const jwksUri = readEnv("TORII_K8S_SA_OIDC_JWKS_URI");

  if (!issuer && !audience && !jwksUri) {
    return null;
  }

  if (!issuer || !audience || !jwksUri) {
    throw new Error(
      "K8s SA OIDC is partially configured; set TORII_K8S_SA_OIDC_ISSUER, TORII_K8S_SA_OIDC_AUDIENCE, and TORII_K8S_SA_OIDC_JWKS_URI together",
    );
  }

  return { issuer, audience, jwksUri };
}

export function resolveK8sSaOidcConfig(): K8sSaOidcConfig {
  const config = tryResolveK8sSaOidcConfig();
  if (!config) {
    throw new Error(
      "Missing K8s SA OIDC configuration (TORII_K8S_SA_OIDC_ISSUER, TORII_K8S_SA_OIDC_AUDIENCE, TORII_K8S_SA_OIDC_JWKS_URI)",
    );
  }
  return config;
}
