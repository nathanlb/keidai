import type { AgentPrincipal } from "@torii/shared";

/** Fake principal until inbound identity middleware (NAT-20) lands. */
export const STUB_AGENT_PRINCIPAL: AgentPrincipal = {
  agentId: "stub-agent",
  ownerId: "stub-user",
  groups: [],
};
