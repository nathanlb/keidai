import { getToriiOrigin } from "../../api/torii-client.js";

/** Gateway-derived OAuth callback URL for a provider (matches OAuthLinkService). */
export function buildToriiOAuthCallbackUrl(providerId: string): string {
  return `${getToriiOrigin()}/oauth/callback/${providerId}`;
}
