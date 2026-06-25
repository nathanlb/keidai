export function deriveOwnerInitials(ownerId: string): string {
  const parts = ownerId
    .split(/[-_]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }

  return ownerId.slice(0, 2).toUpperCase();
}
