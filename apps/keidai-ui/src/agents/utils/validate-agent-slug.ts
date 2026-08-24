const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type AgentSlugValidity = "empty" | "invalid" | "valid";

/**
 * Charset-only check. Uniqueness is a separate, async concern (see
 * `checkSlugAvailability`) — DB still enforces it; this is convenience only.
 */
export function validateAgentSlug(slug: string): AgentSlugValidity {
  const trimmed = slug.trim();
  if (!trimmed) {
    return "empty";
  }
  return SLUG_PATTERN.test(trimmed) ? "valid" : "invalid";
}
