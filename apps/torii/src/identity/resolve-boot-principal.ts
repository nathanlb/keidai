import type { AgentPrincipal, ToriiConfig } from "@keidai/shared";

/**
 * Principal used for boot-time backend connections and catalog refresh.
 * OAuth tokens are keyed by owner_id; boot needs an owner, not an agent.
 */
export function resolveBootPrincipal(config: ToriiConfig): AgentPrincipal {
  return {
    agentId: "boot",
    ownerId: config.boot_owner_id,
    groups: [],
  };
}
