import type { PublicServerConfig } from "@keidai/shared/dto";

export function formatPolicySummary(
  policy: PublicServerConfig["policy"],
): string {
  const allow = policy.allow?.length ?? 0;
  const deny = policy.deny?.length ?? 0;
  const gated = policy.gated?.length ?? 0;
  const granted = allow + gated;

  if (policy.default === "allow") {
    const parts = ["allow"];
    if (deny > 0) {
      parts.push(`${deny} denied`);
    }
    if (gated > 0) {
      parts.push(`${gated} gated`);
    }
    return parts.join(" · ");
  }

  const parts = [`deny · ${granted} allowed`];
  if (gated > 0) {
    parts.push(`${gated} gated`);
  }
  if (deny > 0) {
    parts.push(`${deny} denied`);
  }
  return parts.join(" · ");
}
