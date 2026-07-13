import type { OAuthLinkStatus } from "@keidai/shared";
import type { OAuthToken } from "../types/token-repository.js";
import type { PendingOAuthLink } from "../types/pending-oauth-link.js";

function isTokenExpired(token: OAuthToken): boolean {
  if (!token.expiresAt) {
    return false;
  }
  return token.expiresAt.getTime() <= Date.now();
}

export function deriveOAuthLinkStatus(
  token: OAuthToken | null,
  pendingLink: PendingOAuthLink | null,
): { status: OAuthLinkStatus; error?: string } {
  if (pendingLink?.status === "pending") {
    return { status: "pending" };
  }

  if (pendingLink?.status === "failed") {
    return { status: "failed", error: pendingLink.error };
  }

  if (!token) {
    return { status: "not_linked" };
  }

  if (isTokenExpired(token) && !token.refreshToken) {
    return { status: "expired" };
  }

  return { status: "linked" };
}

export function projectOAuthConnectionStatus(
  ownerId: string,
  provider: string,
  scopes: string[],
  token: OAuthToken | null,
  pendingLink: PendingOAuthLink | null,
): {
  provider: string;
  ownerId: string;
  status: OAuthLinkStatus;
  scopes: string[];
  expiresAt?: string;
  error?: string;
} {
  const { status, error } = deriveOAuthLinkStatus(token, pendingLink);
  return {
    provider,
    ownerId,
    status,
    scopes,
    ...(token?.expiresAt ? { expiresAt: token.expiresAt.toISOString() } : {}),
    ...(error ? { error } : {}),
  };
}
