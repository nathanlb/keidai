import type { OperatorAllowlist } from "./types.js";

export function isOperatorAllowed(
  allowlist: OperatorAllowlist,
  claims: { googleSub: string; email: string },
): boolean {
  if (allowlist.googleSubs.has(claims.googleSub)) {
    return true;
  }

  const email = claims.email.trim().toLowerCase();
  return email.length > 0 && allowlist.emails.has(email);
}

export function parseAllowlistCsv(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
