import type { OAuthProviderConfig } from "@torii/shared";

export function deriveAuthorizeUrl(tokenUrl: string): string {
  const url = new URL(tokenUrl);
  if (!url.pathname.endsWith("/access_token")) {
    throw new Error(`Cannot derive authorize URL from token_url: ${tokenUrl}`);
  }

  url.pathname = `${url.pathname.slice(0, -"access_token".length)}authorize`;
  return url.toString();
}

export function buildOAuthLinkUrl(
  provider: OAuthProviderConfig,
  providerName: string,
  ownerId: string,
): string {
  const authorizeUrl = deriveAuthorizeUrl(provider.token_url);
  const state = Buffer.from(
    JSON.stringify({ ownerId, provider: providerName }),
  ).toString("base64url");
  const params = new URLSearchParams({
    client_id: provider.client_id,
    scope: provider.scopes.join(" "),
    response_type: "code",
    state,
  });

  if (provider.redirect_uri) {
    params.set("redirect_uri", provider.redirect_uri);
  }

  return `${authorizeUrl}?${params.toString()}`;
}
