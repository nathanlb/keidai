import type { GroupServerPolicy } from "../types/group-policy.js";
import { GroupPolicyWriteError } from "../types/group-policy-write.js";

function duplicateToolsInList(
  tools: readonly string[],
  list: "allow" | "deny" | "gated",
  server: string,
): string[] {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const tool of tools) {
    if (seen.has(tool)) {
      errors.push(
        `duplicate tool "${tool}" in ${list} on server "${server}"`,
      );
    }
    seen.add(tool);
  }
  return errors;
}

function overlappingTools(policy: GroupServerPolicy): string[] {
  const errors: string[] = [];
  const allow = new Set(policy.allow);
  const deny = new Set(policy.deny);
  const gated = new Set(policy.gated);

  for (const tool of allow) {
    if (deny.has(tool)) {
      errors.push(
        `overlapping tool lists on server "${policy.server}": "${tool}" is in allow and deny`,
      );
    }
  }
  for (const tool of deny) {
    if (gated.has(tool)) {
      errors.push(
        `overlapping tool lists on server "${policy.server}": "${tool}" is in deny and gated`,
      );
    }
  }
  return errors;
}

/**
 * Validates a group's per-server policies for an API write.
 *
 * Allow ∩ gated is permitted: gating is an extra flag on a granted tool.
 * Allow ∩ deny and deny ∩ gated are rejected as contradictory.
 */
export function assertValidGroupServers(
  servers: readonly GroupServerPolicy[],
  knownServers: ReadonlySet<string>,
): void {
  const errors: string[] = [];
  const seenServers = new Set<string>();

  for (const policy of servers) {
    if (seenServers.has(policy.server)) {
      errors.push(`duplicate server "${policy.server}"`);
    }
    seenServers.add(policy.server);

    if (!knownServers.has(policy.server)) {
      errors.push(`unknown server "${policy.server}"`);
    }

    errors.push(
      ...duplicateToolsInList(policy.allow, "allow", policy.server),
      ...duplicateToolsInList(policy.deny, "deny", policy.server),
      ...duplicateToolsInList(policy.gated, "gated", policy.server),
      ...overlappingTools(policy),
    );
  }

  if (errors.length > 0) {
    throw new GroupPolicyWriteError(errors.join("; "));
  }
}
