import * as jose from "jose";
import type { OperatorAuthConfig } from "./types.js";

const DEFAULT_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
const DEFAULT_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DEFAULT_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const DEFAULT_ISSUER = "https://accounts.google.com";

export function buildGoogleAuthorizationUrl(
  config: OperatorAuthConfig,
  params: { state: string; codeChallenge: string },
): string {
  const endpoint =
    config.googleAuthorizationEndpoint ?? DEFAULT_AUTH_ENDPOINT;
  const url = new URL(endpoint);
  url.searchParams.set("client_id", config.googleClientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeGoogleAuthorizationCode(
  config: OperatorAuthConfig,
  params: { code: string; codeVerifier: string },
): Promise<{
  googleSub: string;
  email: string;
  name?: string;
  picture?: string;
}> {
  if (config.exchangeAuthorizationCode) {
    return config.exchangeAuthorizationCode(params.code, params.codeVerifier);
  }

  const tokenEndpoint = config.googleTokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT;
  const body = new URLSearchParams({
    code: params.code,
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !json.id_token) {
    const detail = json.error_description ?? json.error ?? response.statusText;
    throw new Error(`Google token exchange failed: ${detail}`);
  }

  return verifyGoogleIdToken(config, json.id_token);
}

export async function verifyGoogleIdToken(
  config: OperatorAuthConfig,
  idToken: string,
): Promise<{
  googleSub: string;
  email: string;
  name?: string;
  picture?: string;
}> {
  const jwksUri = config.googleJwksUri ?? DEFAULT_JWKS_URI;
  const issuer = config.googleIssuer ?? DEFAULT_ISSUER;
  const jwks = jose.createRemoteJWKSet(new URL(jwksUri));

  const { payload } = await jose.jwtVerify(idToken, jwks, {
    issuer: [issuer, "accounts.google.com"],
    audience: config.googleClientId,
  });

  const googleSub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!googleSub || !email) {
    throw new Error("Google ID token missing sub or email");
  }

  if (payload.email_verified !== true) {
    throw new Error("Google email is not verified");
  }

  const name = typeof payload.name === "string" ? payload.name : undefined;
  const picture =
    typeof payload.picture === "string" ? payload.picture : undefined;

  return {
    googleSub,
    email,
    ...(name ? { name } : {}),
    ...(picture ? { picture } : {}),
  };
}
