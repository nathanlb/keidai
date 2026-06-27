import type { PublicAgentConfig } from "@keidai/shared";

export interface OwnerAgentGroup {
  ownerId: string;
  agents: PublicAgentConfig[];
}

export function groupAgentsByOwner(
  agents: readonly PublicAgentConfig[],
): OwnerAgentGroup[] {
  const groups = new Map<string, PublicAgentConfig[]>();

  for (const agent of agents) {
    const existing = groups.get(agent.owner_id);
    if (existing) {
      existing.push(agent);
      continue;
    }
    groups.set(agent.owner_id, [agent]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([ownerId, ownerAgents]) => ({
      ownerId,
      agents: [...ownerAgents].sort((left, right) =>
        left.agent_id.localeCompare(right.agent_id),
      ),
    }));
}
