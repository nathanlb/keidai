import { existsSync, readFileSync } from "node:fs";
import * as jose from "jose";

/** Default in-cluster service-account token (auto-mounted for every pod). */
export const DEFAULT_CLUSTER_SA_TOKEN_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/token";

/**
 * Builds a jose remote JWKS resolver that authenticates to the cluster JWKS
 * endpoint. Many clusters (OrbStack, hardened kube-apiserver) reject anonymous
 * JWKS fetches with 401; the pod SA token is accepted.
 *
 * The bearer is re-read on every fetch so projected-token rotation stays valid.
 */
export function createClusterRemoteJwkSet(
  jwksUri: string,
  bearerTokenFile: string = DEFAULT_CLUSTER_SA_TOKEN_PATH,
): jose.JWTVerifyGetKey {
  const url = new URL(jwksUri);

  if (!existsSync(bearerTokenFile)) {
    // Local / unit environments without an in-cluster token fall back to
    // anonymous fetch (compatible with clusters that still allow it).
    return jose.createRemoteJWKSet(url);
  }

  return jose.createRemoteJWKSet(url, {
    [jose.customFetch]: async (requestUrl, options) => {
      const token = readFileSync(bearerTokenFile, "utf8").trim();
      if (!token) {
        throw new Error(`Cluster SA token file is empty: ${bearerTokenFile}`);
      }
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(requestUrl, { ...options, headers });
    },
  });
}
