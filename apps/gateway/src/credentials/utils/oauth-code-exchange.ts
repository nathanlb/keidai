import type { OAuthProviderConfig } from "@keidai/shared";
import type { OAuthToken } from "../types/token-repository.js";
import {
  OAuthTokenExchangeError,
  parseOAuthTokenResponseBody,
  toOAuthToken,
} from "./oauth-token-response.js";

export type OAuthFetch = typeof fetch;

export async function exchangeAuthorizationCode(
  providerConfig: OAuthProviderConfig,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
  fetchFn: OAuthFetch = fetch,
): Promise<OAuthToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: providerConfig.client_id,
    client_secret: providerConfig.client_secret,
  });

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  let response: Response;
  try {
    response = await fetchFn(providerConfig.token_url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OAuth code exchange failed";
    throw new OAuthTokenExchangeError(message, false);
  }

  const responseBody = await response.text();
  const parsed = parseOAuthTokenResponseBody(
    responseBody,
    response.headers.get("content-type"),
  );

  if (!response.ok || parsed.error) {
    const description =
      parsed.error_description ?? parsed.error ?? response.statusText;
    throw new OAuthTokenExchangeError(
      `OAuth code exchange failed: ${description}`,
      response.status >= 400 && response.status < 500,
    );
  }

  return toOAuthToken(parsed);
}
