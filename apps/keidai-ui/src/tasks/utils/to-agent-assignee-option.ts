import type { ManagementAgent } from "../../lib/api/agents.js";
import { deriveAgentInitials } from "../../lib/utils/derive-agent-initials.js";

export interface AgentAssigneeOption {
  agentId: string;
  displayName: string;
  initials: string;
  connected: boolean;
}

export function toAgentAssigneeOption(
  agent: ManagementAgent,
  runtimeReady?: boolean,
): AgentAssigneeOption {
  const displayName = agent.name || agent.slug;

  return {
    agentId: agent.id,
    displayName,
    initials: deriveAgentInitials(displayName),
    connected: runtimeReady === true,
  };
}
