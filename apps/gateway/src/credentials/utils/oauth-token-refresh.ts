import type { OAuthProviderConfig } from "@torii/shared";
import type { OAuthToken } from "../types/token-repository.js";

export interface OAuthTokenRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export class OAuthTokenRefreshError extends Error {
  readonly terminal: boolean;

  constructor(message: string, terminal: boolean) {
    super(message);
    this.name = "OAuthTokenRefreshError";
    this.terminal = terminal;
  }
}

export type OAuthFetch = typeof fetch;

function parseRefreshResponseBody(
  body: string,
  contentType: string | null,
): OAuthTokenRefreshResponse {
  if (contentType?.includes("application/json")) {
    return JSON.parse(body) as OAuthTokenRefreshResponse;
  }

  const params = new URLSearchParams(body);
  const error = params.get("error");
  if (error) {
    return {
      access_token: "",
      error,
      error_description: params.get("error_description") ?? undefined,
    };
  }

  return {
    access_token: params.get("access_token") ?? "",
    refresh_token: params.get("refresh_token") ?? undefined,
    expires_in: params.has("expires_in")
      ? Number(params.get("expires_in"))
      : undefined,
    token_type: params.get("token_type") ?? undefined,
  };
}

export function toRefreshedToken(
  currentToken: OAuthToken,
  response: OAuthTokenRefreshResponse,
): OAuthToken {
  if (!response.access_token) {
    throw new OAuthTokenRefreshError(
      "OAuth refresh response did not include access_token",
      true,
    );
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? currentToken.refreshToken,
    ...(response.expires_in !== undefined
      ? { expiresAt: new Date(Date.now() + response.expires_in * 1000) }
      : {}),
  };
}

export async function refreshOAuthToken(
  providerConfig: OAuthProviderConfig,
  refreshToken: string,
  fetchFn: OAuthFetch = fetch,
): Promise<OAuthToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: providerConfig.client_id,
    client_secret: providerConfig.client_secret,
  });

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
      error instanceof Error ? error.message : "OAuth token refresh failed";
    throw new OAuthTokenRefreshError(message, false);
  }

  const responseBody = await response.text();
  const parsed = parseRefreshResponseBody(
    responseBody,
    response.headers.get("content-type"),
  );

  if (!response.ok || parsed.error) {
    const description = parsed.error_description ?? parsed.error ?? response.statusText;
    throw new OAuthTokenRefreshError(
      `OAuth token refresh failed: ${description}`,
      response.status >= 400 && response.status < 500,
    );
  }

  return toRefreshedToken({ accessToken: "", refreshToken }, parsed);
}
