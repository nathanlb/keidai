import {
  PolicyDecision,
  type AgentPrincipal,
  type PolicyConfig,
} from "@keidai/shared";

/**
 * Evaluates backend tool policy for a principal.
 * v0 rules are tool-level only; principal is threaded for future RBAC.
 */
export function evaluatePolicy(
  _principal: AgentPrincipal | undefined,
  policy: PolicyConfig,
  tool: string,
): PolicyDecision {
  if (policy.default === "deny") {
    return policy.allow?.includes(tool)
      ? PolicyDecision.Allowed
      : PolicyDecision.Denied;
  }

  return policy.deny?.includes(tool)
    ? PolicyDecision.Denied
    : PolicyDecision.Allowed;
}
