import { getToriiOrigin } from "../../api/torii-client.js";

/**
 * Public OAuth callback URL for a provider — operator edge (BFF/Vite), not
 * Torii's internal listen address. Matches Torii `OAuthLinkService` when the
 * gateway base URL is derived from X-Forwarded-Host / TORII_GATEWAY_BASE_URL.
 */
export function buildToriiOAuthCallbackUrl(providerId: string): string {
  return `${getToriiOrigin()}/oauth/callback/${providerId}`;
}
