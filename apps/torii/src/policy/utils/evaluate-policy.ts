import {
  PolicyDecision,
  type AgentPrincipal,
  type GroupDefinitionConfig,
} from "@keidai/shared";
import type { PolicyEvaluation } from "../types/policy-evaluation.js";

function groupGrantsTool(
  group: GroupDefinitionConfig,
  server: string,
  tool: string,
): boolean {
  return group.permissions.some(
    (permission) =>
      permission.server === server && permission.tools.includes(tool),
  );
}

/**
 * Evaluates whether a principal may call `server`/`tool` given group definitions.
 *
 * Fail-closed: unknown groups on the principal deny the call; empty/missing
 * groups grant nothing; allow requires at least one known group grant.
 */
export function evaluatePolicy(
  principal: AgentPrincipal | undefined,
  groups: readonly GroupDefinitionConfig[],
  server: string,
  tool: string,
): PolicyEvaluation {
  const definitions = new Map(groups.map((group) => [group.name, group]));
  const principalGroups = principal?.groups ?? [];

  const unknownGroups = principalGroups.filter(
    (name) => !definitions.has(name),
  );
  if (unknownGroups.length > 0) {
    return {
      decision: PolicyDecision.Denied,
      reason: `unknown_group: ${unknownGroups.join(",")}`,
    };
  }

  for (const name of principalGroups) {
    const definition = definitions.get(name);
    if (definition && groupGrantsTool(definition, server, tool)) {
      return { decision: PolicyDecision.Allowed };
    }
  }

  return {
    decision: PolicyDecision.Denied,
    reason: "policy denied",
  };
}

/** True when any defined group grants `server`/`tool` (catalog membership). */
export function isToolGrantedByAnyGroup(
  groups: readonly GroupDefinitionConfig[],
  server: string,
  tool: string,
): boolean {
  return groups.some((group) => groupGrantsTool(group, server, tool));
}
