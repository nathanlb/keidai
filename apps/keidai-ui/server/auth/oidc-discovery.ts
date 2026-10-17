export interface OidcProviderMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

/**
 * Loads the standard OIDC discovery document for an issuer.
 * Discovery is always `${issuer}/.well-known/openid-configuration`.
 */
export async function discoverOidcProvider(
  issuerUrl: string,
): Promise<OidcProviderMetadata> {
  const issuer = issuerUrl.replace(/\/+$/, "");
  const url = `${issuer}/.well-known/openid-configuration`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `OIDC discovery failed for ${issuer}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `OIDC discovery failed for ${issuer}: HTTP ${response.status}`,
    );
  }

  const json = (await response.json()) as Record<string, unknown>;
  const authorizationEndpoint = stringField(json, "authorization_endpoint");
  const tokenEndpoint = stringField(json, "token_endpoint");
  const jwksUri = stringField(json, "jwks_uri");
  if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
    throw new Error(
      `OIDC discovery document at ${url} is missing endpoints`,
    );
  }

  return {
    issuer: stringField(json, "issuer") ?? issuer,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
  };
}

function stringField(
  document: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = document[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
