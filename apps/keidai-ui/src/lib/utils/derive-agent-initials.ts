/**
 * Two-letter avatar initials for an agent display name. Unlike owner ids
 * (single token, dash/underscore separated), agent names are free text
 * ("Demo Agent", "Newsletter Writer") so this also splits on whitespace.
 */
export function deriveAgentInitials(name: string): string {
  const parts = name
    .split(/[\s-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}
