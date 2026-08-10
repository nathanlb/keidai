import type { AgentPrincipal } from "@keidai/shared";

/**
 * Synthetic principal used only while an operator reconnects a user_oauth
 * backend. Credential resolution keys off `ownerId`; policy is not evaluated
 * during the MCP handshake.
 */
export function operatorReconnectPrincipal(ownerId: string): AgentPrincipal {
  return {
    agentId: "operator-reconnect",
    ownerId,
    groups: [],
    bearerId: "operator-reconnect",
  };
}
