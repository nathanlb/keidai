import type { AgentPrincipal, ToriiConfig } from "@keidai/shared";

/** Fake principal for boot-time work when no agents are registered. */
export const STUB_AGENT_PRINCIPAL: AgentPrincipal = {
  agentId: "stub-agent",
  ownerId: "stub-user",
  groups: [],
};

/**
 * Principal used for boot-time backend connections and catalog refresh.
 * OAuth tokens are keyed by owner_id, so use the first registered agent when
 * available instead of the stub principal.
 */
export function resolveBootAgentPrincipal(config: ToriiConfig): AgentPrincipal {
  const agent = config.agents?.[0];
  if (!agent) {
    return STUB_AGENT_PRINCIPAL;
  }

  return {
    agentId: agent.agent_id,
    ownerId: agent.owner_id,
    groups: agent.groups,
  };
}
