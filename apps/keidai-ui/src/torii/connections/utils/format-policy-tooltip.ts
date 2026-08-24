import type { PublicServerConfig } from "@keidai/shared/dto";

export function formatPolicyTooltip(
  policy: PublicServerConfig["policy"],
): string | undefined {
  const parts: string[] = [];
  if (policy.allow?.length) {
    parts.push(policy.allow.join(", "));
  }
  if (policy.gated?.length) {
    parts.push(`gated: ${policy.gated.join(", ")}`);
  }
  if (policy.deny?.length) {
    parts.push(`denied: ${policy.deny.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
