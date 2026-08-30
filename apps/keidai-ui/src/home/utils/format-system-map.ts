import type { PublicCredentialConfig } from "@keidai/shared";
import type { SystemMapAuth } from "../types/home-digest.js";
import { formatAgentCount } from "./format-home-copy.js";

export function mapCredentialAuth(
  credential: PublicCredentialConfig["strategy"],
): SystemMapAuth {
  if (credential === "user_oauth") {
    return "oauth";
  }
  if (credential === "service_key") {
    return "pat";
  }
  return "none";
}

export function formatSystemMapHeadline(workingCount: number): string {
  if (workingCount <= 0) {
    return "nothing running";
  }
  return `${formatAgentCount(workingCount)} working`;
}

export function formatWorldNote(serverCount: number): string {
  return `systems keidai does not control · ${serverCount} connected`;
}

export function formatRuntimeNote(
  agentCount: number,
  workingCount: number,
): string {
  return `agents execute here · ${formatAgentCount(agentCount)}, ${workingCount} working`;
}

export function formatGroupScope(
  toolCount: number,
  allGated: boolean,
): string {
  const tools = toolCount === 1 ? "1 tool" : `${toolCount} tools`;
  return allGated ? `${tools}, all gated` : tools;
}

export function formatServerSub(options: {
  toolCount: number | null;
  auth: SystemMapAuth;
  gated: boolean;
}): string {
  const { toolCount, auth, gated } = options;
  if (gated) {
    return toolCount == null ? "gated" : `${toolCount} tools · gated`;
  }
  if (toolCount == null) {
    return auth === "none" ? "connected" : auth;
  }
  if (auth === "none") {
    return `${toolCount} tools`;
  }
  return `${toolCount} tools · ${auth}`;
}

export function formatParkedApprovals(count: number): string {
  return count === 1 ? "1 approval parked" : `${count} approvals parked`;
}

export function formatAgentStep(current: number, max: number): string {
  return `step ${current} of ${max}`;
}
