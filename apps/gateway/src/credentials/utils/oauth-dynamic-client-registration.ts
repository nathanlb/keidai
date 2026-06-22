import type { OAuthProviderClient } from "../types/oauth-client-repository.js";

export type OAuthFetch = typeof fetch;

interface DynamicClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
}

export async function registerDynamicOAuthClient(
  registrationEndpoint: string,
  redirectUri: string,
  clientName: string,
  fetchFn: OAuthFetch = fetch,
): Promise<OAuthProviderClient> {
  const response = await fetchFn(registrationEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `OAuth dynamic client registration failed: ${response.status} ${responseBody}`,
    );
  }

  const parsed = JSON.parse(responseBody) as DynamicClientRegistrationResponse;
  if (!parsed.client_id) {
    throw new Error("OAuth dynamic client registration did not return client_id");
  }

  return {
    clientId: parsed.client_id,
    ...(parsed.client_secret ? { clientSecret: parsed.client_secret } : {}),
  };
}
