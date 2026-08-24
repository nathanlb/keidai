import type { GroupServerPolicyView } from "@keidai/shared";
import type { ToolEffect } from "../types/group-editor.js";

/** Match the gateway's per-group, per-tool resolution. */
export function resolveToolEffect(
  policy: GroupServerPolicyView,
  tool: string,
): ToolEffect | "default" {
  if (policy.gated.includes(tool)) {
    return "gated";
  }
  if (policy.deny.includes(tool)) {
    return "denied";
  }
  if (policy.allow.includes(tool)) {
    return "allowed";
  }
  return "default";
}

export function resolveEffectivePermission(
  policy: GroupServerPolicyView,
  tool: string,
): ToolEffect {
  const explicit = resolveToolEffect(policy, tool);
  if (explicit !== "default") {
    return explicit;
  }
  return policy.default === "allow" ? "allowed" : "denied";
}

export function isPermitted(effect: ToolEffect): boolean {
  return effect === "allowed" || effect === "gated";
}
