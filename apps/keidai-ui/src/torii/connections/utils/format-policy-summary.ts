import type { PublicServerConfig } from "@keidai/shared/dto";

export function formatPolicySummary(
  policy: PublicServerConfig["policy"],
): string {
  if (policy.default === "allow") {
    return "allow";
  }

  const allowedCount = policy.allow?.length ?? 0;
  return `deny · ${allowedCount} allowed`;
}
