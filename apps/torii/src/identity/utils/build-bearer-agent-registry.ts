import type { AgentPrincipal, AgentRegistrationConfig } from "@keidai/shared";

export function buildBearerAgentRegistry(
  agents: readonly AgentRegistrationConfig[],
): ReadonlyMap<string, AgentPrincipal> {
  const mappings = new Map<string, AgentPrincipal>();

  for (const registration of agents) {
    const token = registration.inbound_token?.trim();
    if (!token) {
      continue;
    }

    mappings.set(token, Object.freeze({
      agentId: registration.agent_id,
      ownerId: registration.owner_id,
      groups: [...registration.groups],
    }));
  }

  return mappings;
}
