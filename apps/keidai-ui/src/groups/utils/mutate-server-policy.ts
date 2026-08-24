import type { GroupServerPolicyView } from "@keidai/shared";
import type { ToolEffect } from "../types/group-editor.js";

function stripTool(
  policy: GroupServerPolicyView,
  tool: string,
): GroupServerPolicyView {
  return {
    ...policy,
    allow: policy.allow.filter((name) => name !== tool),
    deny: policy.deny.filter((name) => name !== tool),
    gated: policy.gated.filter((name) => name !== tool),
  };
}

/** Write an explicit rule; the tool is stripped from the other arrays first. */
export function setToolRule(
  policy: GroupServerPolicyView,
  tool: string,
  effect: ToolEffect,
): GroupServerPolicyView {
  const next = stripTool(policy, tool);
  if (effect === "allowed") {
    return { ...next, allow: [...next.allow, tool] };
  }
  if (effect === "denied") {
    return { ...next, deny: [...next.deny, tool] };
  }
  return { ...next, gated: [...next.gated, tool] };
}

export function removeToolRule(
  policy: GroupServerPolicyView,
  tool: string,
): GroupServerPolicyView {
  return stripTool(policy, tool);
}

export function setServerDefault(
  policy: GroupServerPolicyView,
  nextDefault: GroupServerPolicyView["default"],
): GroupServerPolicyView {
  return { ...policy, default: nextDefault };
}

export function invertedDefaultEffect(
  policyDefault: GroupServerPolicyView["default"],
): ToolEffect {
  return policyDefault === "allow" ? "denied" : "allowed";
}

export function emptyServerPolicy(server: string): GroupServerPolicyView {
  return {
    server,
    default: "deny",
    allow: [],
    deny: [],
    gated: [],
  };
}

export function replaceServerPolicy(
  servers: readonly GroupServerPolicyView[],
  next: GroupServerPolicyView,
): GroupServerPolicyView[] {
  return servers.map((policy) =>
    policy.server === next.server ? next : policy,
  );
}

export function addServerPolicy(
  servers: readonly GroupServerPolicyView[],
  server: string,
): GroupServerPolicyView[] {
  if (servers.some((policy) => policy.server === server)) {
    return [...servers];
  }
  return [...servers, emptyServerPolicy(server)];
}

export function removeServerPolicy(
  servers: readonly GroupServerPolicyView[],
  server: string,
): GroupServerPolicyView[] {
  return servers.filter((policy) => policy.server !== server);
}
