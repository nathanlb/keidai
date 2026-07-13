import type { AgentPrincipal, AgentRegistrationConfig } from "@keidai/shared";
import { InMemoryAgentRegistry } from "../registry/in-memory-agent-registry.service.js";
import { registryKey } from "./registry-key.js";
import { toValidatedAgentSubject } from "./to-validated-agent-subject.js";

export function buildAgentRegistry(
  agents: readonly AgentRegistrationConfig[],
): InMemoryAgentRegistry {
  const mappings = new Map<string, AgentPrincipal>();

  for (const registration of agents) {
    const subject = toValidatedAgentSubject(registration.subject);
    mappings.set(registryKey(subject), {
      agentId: registration.agent_id,
      ownerId: registration.owner_id,
      groups: [...registration.groups],
    });
  }

  return new InMemoryAgentRegistry(mappings);
}
