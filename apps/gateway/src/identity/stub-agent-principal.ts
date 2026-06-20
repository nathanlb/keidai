import type { AgentPrincipal } from "@torii/shared";

/** Fake principal for boot-time catalog refresh before inbound requests arrive. */
export const STUB_AGENT_PRINCIPAL: AgentPrincipal = {
  agentId: "stub-agent",
  ownerId: "stub-user",
  groups: [],
};
