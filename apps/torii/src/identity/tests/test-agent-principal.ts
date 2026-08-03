import type { AgentPrincipal } from "@keidai/shared";

/** Shared principal for unit/integration tests that need a fixed AgentPrincipal. */
export const TEST_AGENT_PRINCIPAL: AgentPrincipal = {
  agentId: "test-agent",
  ownerId: "test-owner",
  groups: [],
};
