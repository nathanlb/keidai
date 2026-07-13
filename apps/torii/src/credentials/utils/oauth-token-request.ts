import type { OAuthProviderConfig } from "@keidai/shared";

export function buildOAuthTokenRequest(
  providerConfig: OAuthProviderConfig,
  params: Record<string, string>,
): { url: string; init: RequestInit } {
  const clientAuth = providerConfig.token_client_auth ?? "body";
  const bodyFormat = providerConfig.token_body_format ?? "form";

  const headers = new Headers({
    Accept: "application/json",
  });

  if (clientAuth === "basic") {
    if (!providerConfig.client_id || !providerConfig.client_secret) {
      throw new Error("OAuth Basic auth requires client_id and client_secret");
    }
    const encoded = Buffer.from(
      `${providerConfig.client_id}:${providerConfig.client_secret}`,
    ).toString("base64");
    headers.set("Authorization", `Basic ${encoded}`);
  }

  let body: string;
  if (bodyFormat === "json") {
    headers.set("Content-Type", "application/json");
    const payload: Record<string, string> = { ...params };
    if (clientAuth === "body") {
      if (providerConfig.client_id) {
        payload.client_id = providerConfig.client_id;
      }
      if (providerConfig.client_secret) {
        payload.client_secret = providerConfig.client_secret;
      }
    }
    body = JSON.stringify(payload);
  } else {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    const searchParams = new URLSearchParams(params);
    if (clientAuth === "body") {
      if (providerConfig.client_id) {
        searchParams.set("client_id", providerConfig.client_id);
      }
      if (providerConfig.client_secret) {
        searchParams.set("client_secret", providerConfig.client_secret);
      }
    }
    body = searchParams.toString();
  }

  return {
    url: providerConfig.token_url,
    init: {
      method: "POST",
      headers,
      body,
    },
  };
}
