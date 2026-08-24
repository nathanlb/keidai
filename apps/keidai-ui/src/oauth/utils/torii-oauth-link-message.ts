export interface ToriiOAuthLinkMessage {
  type: "torii-oauth-link";
  status: "success" | "error";
  linkId: string | null;
  provider: string;
  error?: string;
}

export function isToriiOAuthLinkMessage(
  data: unknown,
): data is ToriiOAuthLinkMessage {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const message = data as Record<string, unknown>;
  return (
    message.type === "torii-oauth-link" &&
    (message.status === "success" || message.status === "error") &&
    typeof message.provider === "string" &&
    (message.linkId === null || typeof message.linkId === "string")
  );
}
