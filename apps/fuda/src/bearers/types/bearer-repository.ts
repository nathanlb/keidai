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
  create(input: CreateBearerInput): Promise<BearerRecord>;
  get(bearerId: string): Promise<BearerRecord | null>;
  list(): Promise<BearerRecord[]>;
  updateDisplayName(
    bearerId: string,
    displayName: string,
  ): Promise<BearerRecord | null>;
  grant(bearerId: string, agentId: string): Promise<BearerAgentGrant>;
  /**
   * Inserts a grant if missing. Idempotent.
   */
  ensureGrant(bearerId: string, agentId: string): Promise<BearerAgentGrant>;
  revoke(bearerId: string, agentId: string): Promise<boolean>;
  listGrantsForBearer(bearerId: string): Promise<BearerAgentGrant[]>;
  listGrantsForAgent(agentId: string): Promise<BearerAgentGrant[]>;
  hasGrant(bearerId: string, agentId: string): Promise<boolean>;
  /**
   * Deletes the bearer and its grants.
   * Returns false when the bearer does not exist.
   */
  delete(bearerId: string): Promise<boolean>;
}

/** tsyringe injection token for {@link BearerRepository}. */
export const BEARER_REPOSITORY = Symbol("BearerRepository");
