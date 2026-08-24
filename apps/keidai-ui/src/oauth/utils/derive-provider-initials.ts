export function deriveProviderInitials(providerId: string): string {
  const parts = providerId
    .split(/[-_]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }

  return providerId.slice(0, 2).toUpperCase();
}
