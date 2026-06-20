import type { AgentPrincipal } from "@torii/shared";
import type { AgentRegistry } from "../types/agent-registry.js";
import { IdentityResolutionError } from "../types/identity-resolution-error.js";
import type { ValidatedAgentSubject } from "../types/validated-agent-subject.js";

function registryKey(subject: ValidatedAgentSubject): string {
  return `${subject.namespace}/${subject.serviceAccountName}`;
}

export class InMemoryAgentRegistry implements AgentRegistry {
  constructor(
    private readonly mappings: ReadonlyMap<string, AgentPrincipal>,
  ) {}

  lookup(subject: ValidatedAgentSubject): AgentPrincipal {
    const principal = this.mappings.get(registryKey(subject));
    if (!principal) {
      throw new IdentityResolutionError("Agent is not registered");
    }
    return principal;
  }
}
