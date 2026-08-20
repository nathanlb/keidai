/**
 * Parses `FUDA_STATIC_SUBJECT_TOKEN`.
 *
 * Format: one shared secret, or a comma-separated list for rotation overlap.
 *
 * Returns a set, an error string, or `null` when unset.
 */
export function parseStaticSubjectTokens(
  raw: string | undefined,
): ReadonlySet<string> | string | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "FUDA_STATIC_SUBJECT_TOKEN must list at least one subject token";
  }

  const tokens = new Set<string>();
  for (const token of parts) {
    if (token.includes("=")) {
      return "Invalid FUDA_STATIC_SUBJECT_TOKEN entry: expected the shared secret (not secret=bearer_id)";
    }
    if (tokens.has(token)) {
      return "Duplicate token in FUDA_STATIC_SUBJECT_TOKEN";
    }
    tokens.add(token);
  }

  return tokens;
}
