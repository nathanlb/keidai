import type { AgentIdentityResolver, AgentPrincipal } from "@keidai/shared";
import { IdentityResolutionError } from "../types/identity-resolution-error.js";

export class CompositeAgentIdentityResolver implements AgentIdentityResolver {
  constructor(
    private readonly bearerRegistry: ReadonlyMap<string, AgentPrincipal>,
    private readonly k8sResolver: AgentIdentityResolver | null,
  ) {}

  async resolve(credential: string): Promise<AgentPrincipal> {
    const bearerPrincipal = this.bearerRegistry.get(credential);
    if (bearerPrincipal) {
      return Object.freeze({
        agentId: bearerPrincipal.agentId,
        ownerId: bearerPrincipal.ownerId,
        groups: [...bearerPrincipal.groups],
      });
    }

    if (this.k8sResolver) {
      return this.k8sResolver.resolve(credential);
    }

    throw new IdentityResolutionError("Invalid agent credential");
  }
}
