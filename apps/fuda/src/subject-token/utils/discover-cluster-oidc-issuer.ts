import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_CLUSTER_SA_TOKEN_PATH } from "./create-cluster-remote-jwk-set.js";

/**
 * Fetches the cluster's OIDC issuer from the apiserver well-known document.
 *
 * Used when `FUDA_K8S_SA_OIDC_ISSUER` is omitted so Helm/installers do not need
 * to discover and patch the issuer at deploy time.
 *
 * Talks to `kubernetes.default.svc` (the name on the apiserver serving cert),
 * not `KUBERNETES_SERVICE_HOST` (a ClusterIP that often fails TLS hostname
 * checks). `KUBERNETES_SERVICE_HOST` is only the in-cluster probe.
 */
export async function discoverClusterOidcIssuer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (!env.KUBERNETES_SERVICE_HOST?.trim()) {
    throw new Error(
      "FUDA_K8S_SA_OIDC_ISSUER is unset and this process is not in-cluster (KUBERNETES_SERVICE_HOST missing); set FUDA_K8S_SA_OIDC_ISSUER explicitly",
    );
  }

  const port = env.KUBERNETES_SERVICE_PORT?.trim() || "443";
  const discoveryUrl = `https://kubernetes.default.svc:${port}/.well-known/openid-configuration`;

  const headers = new Headers({ Accept: "application/json" });
  const tokenFile =
    env.FUDA_K8S_SA_OIDC_JWKS_BEARER_TOKEN_FILE?.trim() ||
    DEFAULT_CLUSTER_SA_TOKEN_PATH;
  if (existsSync(tokenFile)) {
    const token = readFileSync(tokenFile, "utf8").trim();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(discoveryUrl, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to discover cluster OIDC issuer from ${discoveryUrl}: ${message}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to discover cluster OIDC issuer from ${discoveryUrl}: HTTP ${response.status}`,
    );
  }

  const body = (await response.json()) as { issuer?: unknown };
  if (typeof body.issuer !== "string" || !body.issuer.trim()) {
    throw new Error(
      `Cluster OIDC discovery at ${discoveryUrl} did not include a usable issuer`,
    );
  }

  return body.issuer.trim();
}
