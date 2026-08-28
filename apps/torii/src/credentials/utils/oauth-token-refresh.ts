import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/client";
import { OAuthTokenExchangeError } from "./oauth-token-response.js";

export type OAuthFetch = typeof fetch;

const TERMINAL_OAUTH_CODES = new Set<string>([
  OAuthErrorCode.InvalidGrant,
  OAuthErrorCode.InvalidClient,
  OAuthErrorCode.UnauthorizedClient,
]);

export class OAuthTokenRefreshError extends OAuthTokenExchangeError {
  constructor(message: string, terminal: boolean) {
    super(message, terminal);
    this.name = "OAuthTokenRefreshError";
  }
}

export function isTerminalOAuthFailure(error: unknown): boolean {
  if (OAuthError.isInstance(error) && TERMINAL_OAUTH_CODES.has(error.code)) {
    return true;
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  return /invalid_grant|invalid_client|unauthorized_client|\b400\b|\b401\b/.test(
    `${code} ${message}`,
  );
}
