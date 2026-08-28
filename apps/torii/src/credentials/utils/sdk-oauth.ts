import type { ConnectorOAuthOverride, ConnectorRecord } from "@keidai/shared";
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
  type AuthorizationServerMetadata,
  type OAuthClientInformationMixed,
  type OAuthTokens,
} from "@modelcontextprotocol/client";
import type { OAuthToken } from "../types/token-repository.js";

export interface ResolvedOAuthServer {
  issuer: string;
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
  resource?: URL;
}

export function metadataFromOverride(
  oauth: ConnectorOAuthOverride,
): AuthorizationServerMetadata | undefined {
  if (!oauth.tokenUrl) {
    return undefined;
  }
  const authorizationEndpoint =
    oauth.authorizeUrl ?? deriveAuthorizeUrl(oauth.tokenUrl);
  const issuer =
    oauth.issuer ?? new URL(authorizationEndpoint).origin;
  return {
    issuer,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: oauth.tokenUrl,
    ...(oauth.registrationEndpoint
      ? { registration_endpoint: oauth.registrationEndpoint }
      : {}),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
  };
}

function deriveAuthorizeUrl(tokenUrl: string): string {
  const url = new URL(tokenUrl);
  if (url.pathname.endsWith("/access_token")) {
    url.pathname = `${url.pathname.slice(0, -"access_token".length)}authorize`;
    return url.toString();
  }
  if (url.pathname.endsWith("/token")) {
    url.pathname = `${url.pathname.slice(0, -"token".length)}authorize`;
    return url.toString();
  }
  throw new Error(`Cannot derive authorize URL from token_url: ${tokenUrl}`);
}

const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;

export interface OAuthDiscoveryCacheStore {
  get(resource: string): Promise<{
    issuer: string;
    authorizationServerUrl: string;
    authorizationServerMetadata?: AuthorizationServerMetadata;
    resourceMetadata?: { resource?: string };
    fetchedAt: string;
  } | null>;
  set(record: {
    resource: string;
    issuer: string;
    authorizationServerUrl: string;
    authorizationServerMetadata?: AuthorizationServerMetadata;
    resourceMetadata?: { resource?: string };
    fetchedAt: string;
  }): Promise<void>;
}

export async function resolveOAuthServer(
  connector: ConnectorRecord,
  cache?: OAuthDiscoveryCacheStore,
): Promise<ResolvedOAuthServer> {
  const fromOverride = connector.oauth
    ? metadataFromOverride(connector.oauth)
    : undefined;
  if (fromOverride) {
    return {
      issuer: fromOverride.issuer,
      authorizationServerUrl: fromOverride.issuer,
      metadata: fromOverride,
    };
  }

  const cached = await cache?.get(connector.url);
  if (
    cached?.authorizationServerMetadata?.authorization_endpoint &&
    cached.authorizationServerMetadata.token_endpoint &&
    Date.now() - Date.parse(cached.fetchedAt) < DISCOVERY_TTL_MS
  ) {
    return {
      issuer: cached.issuer,
      authorizationServerUrl: cached.authorizationServerUrl,
      metadata: cached.authorizationServerMetadata,
      resource: cached.resourceMetadata?.resource
        ? new URL(cached.resourceMetadata.resource)
        : undefined,
    };
  }

  const discovered = await discoverOAuthServerInfo(connector.url);
  const metadata = discovered.authorizationServerMetadata;
  if (!metadata?.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error(
      `Could not discover OAuth metadata for "${connector.slug}". Provide authorize/token URLs or BYO client credentials.`,
    );
  }
  await cache?.set({
    resource: connector.url,
    issuer: metadata.issuer,
    authorizationServerUrl: discovered.authorizationServerUrl,
    authorizationServerMetadata: metadata,
    resourceMetadata: discovered.resourceMetadata,
    fetchedAt: new Date().toISOString(),
  });
  return {
    issuer: metadata.issuer,
    authorizationServerUrl: discovered.authorizationServerUrl,
    metadata,
    resource: discovered.resourceMetadata?.resource
      ? new URL(discovered.resourceMetadata.resource)
      : undefined,
  };
}

export function clientInformationFrom(
  clientId: string,
  clientSecret?: string,
): OAuthClientInformationMixed {
  return {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  };
}

export async function startSdkAuthorization(options: {
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
  client: OAuthClientInformationMixed;
  redirectUri: string;
  state: string;
  scope?: string;
  resource?: URL;
}): Promise<{ authorizationUrl: string; codeVerifier: string }> {
  const result = await startAuthorization(options.authorizationServerUrl, {
    metadata: options.metadata,
    clientInformation: options.client,
    redirectUrl: options.redirectUri,
    state: options.state,
    scope: options.scope,
    resource: options.resource,
  });
  return {
    authorizationUrl: result.authorizationUrl.toString(),
    codeVerifier: result.codeVerifier,
  };
}

export async function registerSdkClient(options: {
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
  redirectUri: string;
  clientName: string;
  scope?: string;
}): Promise<{ clientId: string; clientSecret?: string }> {
  const registered = await registerClient(options.authorizationServerUrl, {
    metadata: options.metadata,
    clientMetadata: {
      client_name: options.clientName,
      redirect_uris: [options.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    scope: options.scope,
  });
  return {
    clientId: registered.client_id,
    ...(registered.client_secret
      ? { clientSecret: registered.client_secret }
      : {}),
  };
}

export function toStoredOAuthToken(
  tokens: OAuthTokens,
  previous?: OAuthToken,
): OAuthToken {
  if (!tokens.access_token) {
    throw new Error("OAuth token response did not include access_token");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previous?.refreshToken,
    ...(tokens.expires_in !== undefined
      ? { expiresAt: new Date(Date.now() + tokens.expires_in * 1000) }
      : {}),
  };
}

export async function exchangeSdkAuthorization(options: {
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
  client: OAuthClientInformationMixed;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  resource?: URL;
}): Promise<OAuthToken> {
  const tokens = await exchangeAuthorization(options.authorizationServerUrl, {
    metadata: options.metadata,
    clientInformation: options.client,
    authorizationCode: options.code,
    codeVerifier: options.codeVerifier,
    redirectUri: options.redirectUri,
    resource: options.resource,
  });
  return toStoredOAuthToken(tokens);
}

export async function refreshSdkAuthorization(options: {
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
  client: OAuthClientInformationMixed;
  refreshToken: string;
  resource?: URL;
}): Promise<OAuthToken> {
  const tokens = await refreshAuthorization(options.authorizationServerUrl, {
    metadata: options.metadata,
    clientInformation: options.client,
    refreshToken: options.refreshToken,
    resource: options.resource,
  });
  return toStoredOAuthToken(tokens, {
    accessToken: "",
    refreshToken: options.refreshToken,
  });
}
