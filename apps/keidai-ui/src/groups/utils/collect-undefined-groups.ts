import type { ManagementAgent } from "../../lib/api/agents.js";

export interface UndefinedGroupRef {
  name: string;
  agentCount: number;
}

/** Group names agents reference that have no Torii definition. */
export function collectUndefinedGroups(
  agents: readonly ManagementAgent[],
  knownGroupNames: readonly string[],
): UndefinedGroupRef[] {
  const known = new Set(knownGroupNames);
  const counts = new Map<string, number>();

  for (const agent of agents) {
    const unique = new Set(agent.groups);
    for (const name of unique) {
      if (known.has(name)) {
        continue;
      }
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, agentCount]) => ({ name, agentCount }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function agentsInGroup(
  agents: readonly ManagementAgent[],
  groupName: string,
): ManagementAgent[] {
  return agents.filter((agent) => agent.groups.includes(groupName));
}

export function otherGroupNames(
  agent: ManagementAgent,
  groupName: string,
): string[] {
  return agent.groups.filter((name) => name !== groupName);
}
