import type { OAuthToken } from "../types/token-repository.js";

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export class OAuthTokenExchangeError extends Error {
  readonly terminal: boolean;

  constructor(message: string, terminal: boolean) {
    super(message);
    this.name = "OAuthTokenExchangeError";
    this.terminal = terminal;
  }
}

export function parseOAuthTokenResponseBody(
  body: string,
  contentType: string | null,
): OAuthTokenResponse {
  if (contentType?.includes("application/json")) {
    return JSON.parse(body) as OAuthTokenResponse;
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

export function toOAuthToken(
  response: OAuthTokenResponse,
  currentToken?: OAuthToken,
): OAuthToken {
  if (!response.access_token) {
    throw new OAuthTokenExchangeError(
      "OAuth token response did not include access_token",
      true,
    );
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? currentToken?.refreshToken,
    ...(response.expires_in !== undefined
      ? { expiresAt: new Date(Date.now() + response.expires_in * 1000) }
      : {}),
  };
}
