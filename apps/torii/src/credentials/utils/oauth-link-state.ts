export interface OAuthLinkState {
  ownerId: string;
  provider: string;
  linkId?: string;
}

export function encodeOAuthLinkState(state: OAuthLinkState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeOAuthLinkState(state: string): OAuthLinkState {
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as Partial<OAuthLinkState>;

    if (!parsed.ownerId || !parsed.provider) {
      throw new Error("state payload missing ownerId or provider");
    }

    return {
      ownerId: parsed.ownerId,
      provider: parsed.provider,
      ...(parsed.linkId ? { linkId: parsed.linkId } : {}),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid OAuth state payload";
    throw new Error(`OAuth callback state validation failed: ${message}`);
  }
}
