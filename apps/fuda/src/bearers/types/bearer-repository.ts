export interface BearerRecord {
  bearerId: string;
  displayName: string;
}

export interface BearerAgentGrant {
  bearerId: string;
  agentId: string;
}

export interface CreateBearerInput {
  bearerId: string;
  displayName: string;
}

export interface BearerRepository {
  create(input: CreateBearerInput): BearerRecord;
  get(bearerId: string): BearerRecord | null;
  list(): BearerRecord[];
  updateDisplayName(
    bearerId: string,
    displayName: string,
  ): BearerRecord | null;
  grant(bearerId: string, agentId: string): BearerAgentGrant;
  revoke(bearerId: string, agentId: string): boolean;
  listGrantsForBearer(bearerId: string): BearerAgentGrant[];
  listGrantsForAgent(agentId: string): BearerAgentGrant[];
  hasGrant(bearerId: string, agentId: string): boolean;
  /**
   * Deletes the bearer and its grants.
   * Returns false when the bearer does not exist.
   */
  delete(bearerId: string): boolean;
}

/** tsyringe injection token for {@link BearerRepository}. */
export const BEARER_REPOSITORY = Symbol("BearerRepository");
