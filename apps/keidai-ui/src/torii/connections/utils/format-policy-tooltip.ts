import type { PublicServerConfig } from "@keidai/shared/dto";

export function formatPolicyTooltip(
  policy: PublicServerConfig["policy"],
): string | undefined {
  const allowed = policy.allow;
  if (!allowed?.length) {
    return undefined;
  }

  return allowed.join(", ");
}
