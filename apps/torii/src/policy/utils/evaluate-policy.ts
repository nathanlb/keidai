import {
  PolicyDecision,
  type AgentPrincipal,
} from "@keidai/shared";
import type { PolicyEvaluation } from "../types/policy-evaluation.js";
import type {
  GroupPolicySnapshot,
  GroupServerPolicy,
  PolicyEffect,
} from "../types/group-policy.js";

function serverPolicyFor(
  group: GroupPolicySnapshot,
  server: string,
): GroupServerPolicy | undefined {
  return group.servers.find((policy) => policy.server === server);
}

/**
 * A group without a policy for `server` abstains so another membership
 * group's grant still applies. An existing server policy always votes
 * allow or deny (lists first, then `default`).
 */
function vote(
  policy: GroupServerPolicy | undefined,
  tool: string,
): PolicyEffect | "abstain" {
  if (!policy) {
    return "abstain";
  }
  if (policy.deny.includes(tool)) {
    return "deny";
  }
  if (policy.allow.includes(tool)) {
    return "allow";
  }
  return policy.default;
}

function groupGrantsTool(
  group: GroupPolicySnapshot,
  server: string,
  tool: string,
): boolean {
  return vote(serverPolicyFor(group, server), tool) === "allow";
}

/**
 * Evaluates whether a principal may call `server`/`tool` given group policies.
 *
 * Fail-closed: unknown groups on the principal deny the call; empty/missing
 * groups grant nothing. Per membership group: deny list, else allow list,
 * else `default`. Combine: any deny → Denied; else any allow → Allowed;
 * else Denied.
 */
export function evaluatePolicy(
  principal: AgentPrincipal | undefined,
  groups: readonly GroupPolicySnapshot[],
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

  let anyDeny = false;
  let anyAllow = false;
  for (const name of principalGroups) {
    const definition = definitions.get(name);
    if (!definition) {
      continue;
    }
    const effect = vote(serverPolicyFor(definition, server), tool);
    if (effect === "deny") {
      anyDeny = true;
    } else if (effect === "allow") {
      anyAllow = true;
    }
  }

  if (anyDeny) {
    return {
      decision: PolicyDecision.Denied,
      reason: "policy denied",
    };
  }
  if (anyAllow) {
    return { decision: PolicyDecision.Allowed };
  }

  return {
    decision: PolicyDecision.Denied,
    reason: "policy denied",
  };
}

/** True when any defined group grants `server`/`tool` (catalog membership). */
export function isToolGrantedByAnyGroup(
  groups: readonly GroupPolicySnapshot[],
  server: string,
  tool: string,
): boolean {
  return groups.some((group) => groupGrantsTool(group, server, tool));
}

/**
 * True when any of the principal's membership groups lists `tool` under
 * `gated` for `server`. Uses bare tool names.
 */
export function isGatedToolForGroups(
  principal: AgentPrincipal | undefined,
  groups: readonly GroupPolicySnapshot[],
  server: string,
  tool: string,
): boolean {
  if (!principal) {
    return false;
  }

  const definitions = new Map(groups.map((group) => [group.name, group]));
  for (const name of principal.groups) {
    const definition = definitions.get(name);
    const policy = definition ? serverPolicyFor(definition, server) : undefined;
    if (policy?.gated.includes(tool)) {
      return true;
    }
  }
  return false;
}
