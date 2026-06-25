import type { OAuthProviderConfig } from "@keidai/shared";

export interface BuildOAuthLinkUrlOptions {
  codeChallenge?: string;
  linkId?: string;
}

export function deriveAuthorizeUrl(tokenUrl: string): string {
  const url = new URL(tokenUrl);
  if (!url.pathname.endsWith("/access_token")) {
    throw new Error(`Cannot derive authorize URL from token_url: ${tokenUrl}`);
  }

  url.pathname = `${url.pathname.slice(0, -"access_token".length)}authorize`;
  return url.toString();
}

function resolveAuthorizeUrl(provider: OAuthProviderConfig): string {
  if (provider.authorize_url) {
    return provider.authorize_url;
  }
  return deriveAuthorizeUrl(provider.token_url);
}

export function buildOAuthLinkUrl(
  provider: OAuthProviderConfig,
  providerName: string,
  ownerId: string,
  options: BuildOAuthLinkUrlOptions = {},
): string {
  const authorizeUrl = resolveAuthorizeUrl(provider);
  if (!provider.client_id) {
    throw new Error("OAuth client_id is required to build an authorize URL");
  }
  const statePayload: { ownerId: string; provider: string; linkId?: string } = {
    ownerId,
    provider: providerName,
  };
  if (options.linkId) {
    statePayload.linkId = options.linkId;
  }
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");
  const params = new URLSearchParams({
    client_id: provider.client_id,
    scope: provider.scopes.join(" "),
    response_type: "code",
    state,
  });

  if (provider.redirect_uri) {
    params.set("redirect_uri", provider.redirect_uri);
  }

  for (const [key, value] of Object.entries(provider.authorize_params ?? {})) {
    params.set(key, value);
  }

  if (options.codeChallenge) {
    params.set("code_challenge", options.codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return `${authorizeUrl}?${params.toString()}`;
}
