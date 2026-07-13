import type { PublicAgentConfig } from "@keidai/shared";
import { deriveOwnerInitials } from "../../../shell/utils/derive-owner-initials.js";
import { formatAgentSubject } from "../../../torii/agents/utils/format-agent-subject.js";

export interface AgentAssigneeOption {
  agentId: string;
  displayName: string;
  initials: string;
  connected: boolean;
}

export function toAgentAssigneeOption(
  agent: PublicAgentConfig,
  runtimeAgentId?: string,
): AgentAssigneeOption {
  const subjectLabel =
    agent.subject.kind === "k8s_service_account"
      ? agent.subject.service_account
      : formatAgentSubject(agent.subject);

  return {
    agentId: agent.agent_id,
    displayName: subjectLabel || agent.agent_id,
    initials: deriveOwnerInitials(subjectLabel || agent.agent_id),
    connected: runtimeAgentId
      ? agent.agent_id === runtimeAgentId
      : false,
  };
}
