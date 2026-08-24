/** Identity + registry record. Owner and slug are fixed at registration. */
export interface ManagementAgent {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  /** Opaque group strings; Torii fails closed on groups it does not define. */
  groups: string[];
  /** Content of the current persona version. */
  persona: string;
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

export interface Bearer {
  bearerId: string;
  displayName: string;
}

export interface Grant {
  bearerId: string;
  agentId: string;
}

export interface CreateAgentRequest {
  slug: string;
  name: string;
  ownerId: string;
  groups: string[];
  persona: string;
}

export interface UpdateAgentRequest {
  name?: string;
  groups?: string[];
  /** Appends a new persona version; never mutates existing content. */
  persona?: string;
}
