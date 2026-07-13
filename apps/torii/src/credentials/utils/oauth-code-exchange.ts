import type { OAuthProviderConfig } from "@keidai/shared";
import type { OAuthToken } from "../types/token-repository.js";
import { buildOAuthTokenRequest } from "./oauth-token-request.js";
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
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };

  if (codeVerifier) {
    params.code_verifier = codeVerifier;
  }

  const { url, init } = buildOAuthTokenRequest(providerConfig, params);

  let response: Response;
  try {
    response = await fetchFn(url, init);
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
