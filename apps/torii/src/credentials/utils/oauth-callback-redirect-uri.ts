/** Gateway OAuth callback URL: `{baseUrl}/oauth/callback/{provider}`. */
export function buildOAuthCallbackRedirectUri(
  baseUrl: string,
  provider: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/oauth/callback/${provider}`;
}
