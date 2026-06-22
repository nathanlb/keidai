import type { OAuthProviderConfig } from "@keidai/shared";
import type { OAuthToken } from "../types/token-repository.js";
import { buildOAuthTokenRequest } from "./oauth-token-request.js";
import {
  OAuthTokenExchangeError,
  parseOAuthTokenResponseBody,
  toOAuthToken,
} from "./oauth-token-response.js";

export type OAuthFetch = typeof fetch;

export class OAuthTokenRefreshError extends OAuthTokenExchangeError {
  constructor(message: string, terminal: boolean) {
    super(message, terminal);
    this.name = "OAuthTokenRefreshError";
  }
}

export function toRefreshedToken(
  currentToken: OAuthToken,
  response: Parameters<typeof toOAuthToken>[0],
): OAuthToken {
  try {
    return toOAuthToken(response, currentToken);
  } catch (error) {
    if (error instanceof OAuthTokenExchangeError) {
      throw new OAuthTokenRefreshError(error.message, error.terminal);
    }
    throw error;
  }
}

export async function refreshOAuthToken(
  providerConfig: OAuthProviderConfig,
  refreshToken: string,
  fetchFn: OAuthFetch = fetch,
): Promise<OAuthToken> {
  const { url, init } = buildOAuthTokenRequest(providerConfig, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OAuth token refresh failed";
    throw new OAuthTokenRefreshError(message, false);
  }

  const responseBody = await response.text();
  const parsed = parseOAuthTokenResponseBody(
    responseBody,
    response.headers.get("content-type"),
  );

  if (!response.ok || parsed.error) {
    const description =
      parsed.error_description ?? parsed.error ?? response.statusText;
    throw new OAuthTokenRefreshError(
      `OAuth token refresh failed: ${description}`,
      response.status >= 400 && response.status < 500,
    );
  }

  return toRefreshedToken({ accessToken: "", refreshToken }, parsed);
}
