function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function withHash(channel: string): string {
  return channel.startsWith("#") ? channel : `#${channel}`;
}

/**
 * Best-effort impact line from captured approval params. Unknown tools fall
 * back to an empty string so the row still reads on the tool name alone.
 */
export function deriveApprovalImpact(
  params: Record<string, unknown>,
): string {
  const to = asNonEmptyString(params.to) ?? asNonEmptyString(params.recipient);
  if (to) {
    return `Sends to ${to}`;
  }

  const channel = asNonEmptyString(params.channel);
  if (channel) {
    return `Posts to ${withHash(channel)}`;
  }

  const path =
    asNonEmptyString(params.path) ?? asNonEmptyString(params.filename);
  if (path) {
    return `Writes ${path}`;
  }

  return "";
}
