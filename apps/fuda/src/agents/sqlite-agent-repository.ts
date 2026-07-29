import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  AgentRecord,
  AgentRepository,
  CreateAgentInput,
  PersonaVersion,
  UpdateAgentGroupsInput,
  UpdateAgentNameInput,
} from "./types/agent-repository.js";

interface AgentRow {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  groups_json: string;
  current_persona_version: number;
  created_at: string;
  updated_at: string;
}

interface PersonaRow {
  agent_id: string;
  version: number;
  content: string;
  created_at: string;
}

function rowToAgent(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ownerId: row.owner_id,
    groups: JSON.parse(row.groups_json) as string[],
    currentPersonaVersion: row.current_persona_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPersona(row: PersonaRow): PersonaVersion {
  return {
    agentId: row.agent_id,
    version: row.version,
    content: row.content,
    createdAt: row.created_at,
  };
}

export class SqliteAgentRepository implements AgentRepository {
  private readonly insertAgentStatement;
  private readonly insertPersonaStatement;
  private readonly getByIdStatement;
  private readonly getBySlugStatement;
  private readonly listStatement;
  private readonly updateNameStatement;
  private readonly updateGroupsStatement;
  private readonly updateCurrentPersonaStatement;
  private readonly getPersonaStatement;
  private readonly deleteGrantsStatement;
  private readonly deletePersonasStatement;
  private readonly deleteAgentStatement;

  constructor(private readonly db: DatabaseSync) {
    this.insertAgentStatement = db.prepare(`
      INSERT INTO agents (
        id, slug, name, owner_id, groups_json,
        current_persona_version, created_at, updated_at
      ) VALUES (
        @id, @slug, @name, @owner_id, @groups_json,
        @current_persona_version, @created_at, @updated_at
      )
    `);
    this.insertPersonaStatement = db.prepare(`
      INSERT INTO persona_versions (agent_id, version, content, created_at)
      VALUES (@agent_id, @version, @content, @created_at)
    `);
    this.getByIdStatement = db.prepare(`
      SELECT id, slug, name, owner_id, groups_json,
             current_persona_version, created_at, updated_at
      FROM agents
      WHERE id = ?
    `);
    this.getBySlugStatement = db.prepare(`
      SELECT id, slug, name, owner_id, groups_json,
             current_persona_version, created_at, updated_at
      FROM agents
      WHERE slug = ?
    `);
    this.listStatement = db.prepare(`
      SELECT id, slug, name, owner_id, groups_json,
             current_persona_version, created_at, updated_at
      FROM agents
      ORDER BY slug ASC
    `);
    this.updateNameStatement = db.prepare(`
      UPDATE agents
      SET name = @name, updated_at = @updated_at
      WHERE id = @id
    `);
    this.updateGroupsStatement = db.prepare(`
      UPDATE agents
      SET groups_json = @groups_json, updated_at = @updated_at
      WHERE id = @id
    `);
    this.updateCurrentPersonaStatement = db.prepare(`
      UPDATE agents
      SET current_persona_version = @version, updated_at = @updated_at
      WHERE id = @id
    `);
    this.getPersonaStatement = db.prepare(`
      SELECT agent_id, version, content, created_at
      FROM persona_versions
      WHERE agent_id = ? AND version = ?
    `);
    this.deleteGrantsStatement = db.prepare(`
      DELETE FROM bearer_agent_grants WHERE agent_id = ?
    `);
    this.deletePersonasStatement = db.prepare(`
      DELETE FROM persona_versions WHERE agent_id = ?
    `);
    this.deleteAgentStatement = db.prepare(`
      DELETE FROM agents WHERE id = ?
    `);
  }

  create(input: CreateAgentInput): AgentRecord {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    const initialVersion = 1;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.insertAgentStatement.run({
        id,
        slug: input.slug,
        name: input.name,
        owner_id: input.ownerId,
        groups_json: JSON.stringify(input.groups),
        current_persona_version: initialVersion,
        created_at: now,
        updated_at: now,
      });
      this.insertPersonaStatement.run({
        agent_id: id,
        version: initialVersion,
        content: input.persona,
        created_at: now,
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      id,
      slug: input.slug,
      name: input.name,
      ownerId: input.ownerId,
      groups: [...input.groups],
      currentPersonaVersion: initialVersion,
      createdAt: now,
      updatedAt: now,
    };
  }

  get(agentId: string): AgentRecord | null {
    const row = this.getByIdStatement.get(agentId) as AgentRow | undefined;
    return row ? rowToAgent(row) : null;
  }

  getBySlug(slug: string): AgentRecord | null {
    const row = this.getBySlugStatement.get(slug) as AgentRow | undefined;
    return row ? rowToAgent(row) : null;
  }

  list(): AgentRecord[] {
    const rows = this.listStatement.all() as unknown as AgentRow[];
    return rows.map(rowToAgent);
  }

  updateName(
    agentId: string,
    input: UpdateAgentNameInput,
  ): AgentRecord | null {
    const existing = this.get(agentId);
    if (!existing) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    this.updateNameStatement.run({
      id: agentId,
      name: input.name,
      updated_at: updatedAt,
    });

    return {
      ...existing,
      name: input.name,
      updatedAt,
    };
  }

  updateGroups(
    agentId: string,
    input: UpdateAgentGroupsInput,
  ): AgentRecord | null {
    const existing = this.get(agentId);
    if (!existing) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    this.updateGroupsStatement.run({
      id: agentId,
      groups_json: JSON.stringify(input.groups),
      updated_at: updatedAt,
    });

    return {
      ...existing,
      groups: [...input.groups],
      updatedAt,
    };
  }

  appendPersona(agentId: string, content: string): PersonaVersion | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const agent = this.get(agentId);
      if (!agent) {
        this.db.exec("ROLLBACK");
        return null;
      }

      const version = agent.currentPersonaVersion + 1;
      const createdAt = new Date().toISOString();

      this.insertPersonaStatement.run({
        agent_id: agentId,
        version,
        content,
        created_at: createdAt,
      });
      this.updateCurrentPersonaStatement.run({
        id: agentId,
        version,
        updated_at: createdAt,
      });
      this.db.exec("COMMIT");

      return {
        agentId,
        version,
        content,
        createdAt,
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getPersonaVersion(
    agentId: string,
    version: number,
  ): PersonaVersion | null {
    const row = this.getPersonaStatement.get(agentId, version) as
      | PersonaRow
      | undefined;
    return row ? rowToPersona(row) : null;
  }

  getCurrentPersona(agentId: string): PersonaVersion | null {
    const agent = this.get(agentId);
    if (!agent) {
      return null;
    }
    return this.getPersonaVersion(agentId, agent.currentPersonaVersion);
  }

  delete(agentId: string): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.get(agentId);
      if (!existing) {
        this.db.exec("ROLLBACK");
        return false;
      }

      this.deleteGrantsStatement.run(agentId);
      this.deletePersonasStatement.run(agentId);
      this.deleteAgentStatement.run(agentId);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
