import type { ServiceHealth } from "../types/service-health.js";

export type ServiceStatusKind = "healthy" | "degraded" | "down";

export function getServiceStatusKind(status: ServiceHealth): ServiceStatusKind {
  if (status.healthy) {
    return "healthy";
  }
  if (status.label === "Unreachable") {
    return "down";
  }
  return "degraded";
}

export const statusColorClass: Record<ServiceStatusKind, string> = {
  healthy: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
};

export function formatEcosystemVersion(
  statuses: readonly ServiceHealth[],
): string {
  const versions = statuses
    .map((status) => status.version.trim())
    .filter((version) => version.length > 0);
  if (versions.length === 0) {
    return "";
  }

  const counts = new Map<string, number>();
  for (const version of versions) {
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  let chosen = versions[0] ?? "";
  let best = 0;
  for (const [version, count] of counts) {
    if (count > best) {
      chosen = version;
      best = count;
    }
  }
  return chosen.startsWith("v") ? chosen : `v${chosen}`;
}
