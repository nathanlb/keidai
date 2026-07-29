export interface AgentRecord {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  groups: string[];
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
}

export interface UpdateAgentNameInput {
  name: string;
}

export interface AgentRepository {
  create(input: CreateAgentInput): AgentRecord;
  get(agentId: string): AgentRecord | null;
  getBySlug(slug: string): AgentRecord | null;
  list(): AgentRecord[];
  /** Freely editable display name. Does not touch persona or slug. */
  updateName(agentId: string, input: UpdateAgentNameInput): AgentRecord | null;
  /**
   * Append-only persona edit. Inserts a new version row and advances
   * `currentPersonaVersion`. Never mutates existing persona content.
   */
  appendPersona(agentId: string, content: string): PersonaVersion | null;
  getPersonaVersion(agentId: string, version: number): PersonaVersion | null;
  getCurrentPersona(agentId: string): PersonaVersion | null;
}

/** tsyringe injection token for {@link AgentRepository}. */
export const AGENT_REPOSITORY = Symbol("AgentRepository");
