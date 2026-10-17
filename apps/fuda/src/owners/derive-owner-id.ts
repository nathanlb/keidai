/**
 * Stable slug from an email local-part. Collisions get a numeric suffix
 * at insert time; this function only normalizes.
 */
export function deriveOwnerId(email: string): string {
  const local = email.split("@")[0] ?? "";
  const normalized = local
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "user";
}
