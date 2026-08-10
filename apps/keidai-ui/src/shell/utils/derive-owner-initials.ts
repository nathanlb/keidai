/** Initials from a display name, email, or opaque owner id. */
export function deriveOwnerInitials(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "?";
  }

  if (trimmed.includes("@")) {
    const local = trimmed.split("@")[0] ?? trimmed;
    return deriveOwnerInitials(local);
  }

  const spaceParts = trimmed
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (spaceParts.length >= 2) {
    return `${spaceParts[0]![0] ?? ""}${spaceParts[1]![0] ?? ""}`.toUpperCase();
  }

  const parts = trimmed
    .split(/[-_.]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}
