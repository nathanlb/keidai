export interface AgentRecord {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  groups: string[];
  /** OpenRouter model id, or null to use the platform default at run time. */
  defaultModelId: string | null;
  /** Single emoji shown in operator surfaces, or null for initials. */
  emoji: string | null;
  currentPersonaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaVersion {
  agentId: string;
  version: number;
  content: string;
  createdAt: string;
}

export interface CreateAgentInput {
  /** Opaque primary key. Generated when omitted. */
  id?: string;
  slug: string;
  name: string;
  ownerId: string;
  /** Opaque group strings; Torii fails closed on unknown ones. */
  groups: string[];
  /** Initial persona content (stored as version 1). */
  persona: string;
  /** Omit or null to leave the agent on the platform default model. */
  defaultModelId?: string | null;
  /** Omit or null to show initials instead. */
  emoji?: string | null;
}

export interface UpdateAgentNameInput {
  name: string;
}

export interface UpdateAgentGroupsInput {
  /** Opaque group strings; Torii fails closed on unknown ones. */
  groups: string[];
}

export interface UpdateAgentDefaultModelInput {
  /** Null clears the agent default so runs use the platform model. */
  defaultModelId: string | null;
}

export interface UpdateAgentEmojiInput {
  /** Null clears the emoji so surfaces fall back to initials. */
  emoji: string | null;
}

export interface AgentRepository {
  create(input: CreateAgentInput): Promise<AgentRecord>;
  get(agentId: string): Promise<AgentRecord | null>;
  getBySlug(slug: string): Promise<AgentRecord | null>;
  list(): Promise<AgentRecord[]>;
  /** Freely editable display name. Does not touch persona or slug. */
  updateName(
    agentId: string,
    input: UpdateAgentNameInput,
  ): Promise<AgentRecord | null>;
  /** Replace opaque group membership. Does not validate against Torii. */
  updateGroups(
    agentId: string,
    input: UpdateAgentGroupsInput,
  ): Promise<AgentRecord | null>;
  /** Replace or clear the agent's default OpenRouter model. */
  updateDefaultModel(
    agentId: string,
    input: UpdateAgentDefaultModelInput,
  ): Promise<AgentRecord | null>;
  /** Replace or clear the agent's display emoji. */
  updateEmoji(
    agentId: string,
    input: UpdateAgentEmojiInput,
  ): Promise<AgentRecord | null>;
  /**
   * Append-only persona edit. Inserts a new version row and advances
   * `currentPersonaVersion`. Never mutates existing persona content.
   */
  appendPersona(
    agentId: string,
    content: string,
  ): Promise<PersonaVersion | null>;
  getPersonaVersion(
    agentId: string,
    version: number,
  ): Promise<PersonaVersion | null>;
  getCurrentPersona(agentId: string): Promise<PersonaVersion | null>;
  /** All persona versions for an agent, newest first. */
  listPersonas(agentId: string): Promise<PersonaVersion[]>;
  /**
   * Deletes the agent and its persona versions / grants.
   * Returns false when the agent does not exist.
   */
  delete(agentId: string): Promise<boolean>;
}

/** tsyringe injection token for {@link AgentRepository}. */
export const AGENT_REPOSITORY = Symbol("AgentRepository");
