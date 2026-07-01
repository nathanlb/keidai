import { getGatewayOrigin } from "../../../shell/api/gateway-client.js";

/** Gateway-derived OAuth callback URL for a provider (matches OAuthLinkService). */
export function buildGatewayOAuthCallbackUrl(providerId: string): string {
  return `${getGatewayOrigin()}/oauth/callback/${providerId}`;
}
