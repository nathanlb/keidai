import { toIso, withTransaction, type Pool } from "@keidai/postgres";
import { randomUUID } from "node:crypto";
import type {
  AgentRecord,
  AgentRepository,
  CreateAgentInput,
  PersonaVersion,
  UpdateAgentDefaultModelInput,
  UpdateAgentEmojiInput,
  UpdateAgentGroupsInput,
  UpdateAgentNameInput,
} from "./types/agent-repository.js";

interface AgentRow {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  groups_json: string[] | string;
  default_model_id: string | null;
  emoji: string | null;
  current_persona_version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const AGENT_COLUMNS = `
  id, slug, name, owner_id, groups_json, default_model_id, emoji,
  current_persona_version, created_at, updated_at
`;

interface PersonaRow {
  agent_id: string;
  version: number;
  content: string;
  created_at: Date | string;
}

function parseGroups(value: string[] | string): string[] {
  return Array.isArray(value) ? value : (JSON.parse(value) as string[]);
}

function rowToAgent(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ownerId: row.owner_id,
    groups: parseGroups(row.groups_json),
    defaultModelId: row.default_model_id,
    emoji: row.emoji,
    currentPersonaVersion: row.current_persona_version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToPersona(row: PersonaRow): PersonaVersion {
  return {
    agentId: row.agent_id,
    version: row.version,
    content: row.content,
    createdAt: toIso(row.created_at),
  };
}

export class PgAgentRepository implements AgentRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateAgentInput): Promise<AgentRecord> {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    const initialVersion = 1;

    await withTransaction(this.pool, async (client) => {
      await client.query(
        `
          INSERT INTO agents (
            id, slug, name, owner_id, groups_json, default_model_id, emoji,
            current_persona_version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
        `,
        [
          id,
          input.slug,
          input.name,
          input.ownerId,
          JSON.stringify(input.groups),
          input.defaultModelId ?? null,
          input.emoji ?? null,
          initialVersion,
          now,
          now,
        ],
      );
      await client.query(
        `
          INSERT INTO persona_versions (agent_id, version, content, created_at)
          VALUES ($1, $2, $3, $4)
        `,
        [id, initialVersion, input.persona, now],
      );
    });

    return {
      id,
      slug: input.slug,
      name: input.name,
      ownerId: input.ownerId,
      groups: [...input.groups],
      defaultModelId: input.defaultModelId ?? null,
      emoji: input.emoji ?? null,
      currentPersonaVersion: initialVersion,
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(agentId: string): Promise<AgentRecord | null> {
    const result = await this.pool.query<AgentRow>(
      `
        SELECT ${AGENT_COLUMNS}
        FROM agents
        WHERE id = $1
      `,
      [agentId],
    );
    const row = result.rows[0];
    return row ? rowToAgent(row) : null;
  }

  async getBySlug(slug: string): Promise<AgentRecord | null> {
    const result = await this.pool.query<AgentRow>(
      `
        SELECT ${AGENT_COLUMNS}
        FROM agents
        WHERE slug = $1
      `,
      [slug],
    );
    const row = result.rows[0];
    return row ? rowToAgent(row) : null;
  }

  async list(): Promise<AgentRecord[]> {
    const result = await this.pool.query<AgentRow>(
      `
        SELECT ${AGENT_COLUMNS}
        FROM agents
        ORDER BY slug ASC
      `,
    );
    return result.rows.map(rowToAgent);
  }

  async updateName(
    agentId: string,
    input: UpdateAgentNameInput,
  ): Promise<AgentRecord | null> {
    const existing = await this.get(agentId);
    if (!existing) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    await this.pool.query(
      `UPDATE agents SET name = $1, updated_at = $2 WHERE id = $3`,
      [input.name, updatedAt, agentId],
    );

    return {
      ...existing,
      name: input.name,
      updatedAt,
    };
  }

  async updateGroups(
    agentId: string,
    input: UpdateAgentGroupsInput,
  ): Promise<AgentRecord | null> {
    const existing = await this.get(agentId);
    if (!existing) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    await this.pool.query(
      `UPDATE agents SET groups_json = $1::jsonb, updated_at = $2 WHERE id = $3`,
      [JSON.stringify(input.groups), updatedAt, agentId],
    );

    return {
      ...existing,
      groups: [...input.groups],
      updatedAt,
    };
  }

  async updateDefaultModel(
    agentId: string,
    input: UpdateAgentDefaultModelInput,
  ): Promise<AgentRecord | null> {
    const existing = await this.get(agentId);
    if (!existing) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    await this.pool.query(
      `UPDATE agents SET default_model_id = $1, updated_at = $2 WHERE id = $3`,
      [input.defaultModelId, updatedAt, agentId],
    );

    return {
      ...existing,
      defaultModelId: input.defaultModelId,
      updatedAt,
    };
  }

  async updateEmoji(
    agentId: string,
    input: UpdateAgentEmojiInput,
  ): Promise<AgentRecord | null> {
    const existing = await this.get(agentId);
    if (!existing) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    await this.pool.query(
      `UPDATE agents SET emoji = $1, updated_at = $2 WHERE id = $3`,
      [input.emoji, updatedAt, agentId],
    );

    return {
      ...existing,
      emoji: input.emoji,
      updatedAt,
    };
  }

  async appendPersona(
    agentId: string,
    content: string,
  ): Promise<PersonaVersion | null> {
    return withTransaction(this.pool, async (client) => {
      const agentResult = await client.query<AgentRow>(
        `
          SELECT ${AGENT_COLUMNS}
          FROM agents
          WHERE id = $1
        `,
        [agentId],
      );
      const agentRow = agentResult.rows[0];
      if (!agentRow) {
        return null;
      }

      const version = agentRow.current_persona_version + 1;
      const createdAt = new Date().toISOString();

      await client.query(
        `
          INSERT INTO persona_versions (agent_id, version, content, created_at)
          VALUES ($1, $2, $3, $4)
        `,
        [agentId, version, content, createdAt],
      );
      await client.query(
        `
          UPDATE agents
          SET current_persona_version = $1, updated_at = $2
          WHERE id = $3
        `,
        [version, createdAt, agentId],
      );

      return {
        agentId,
        version,
        content,
        createdAt,
      };
    });
  }

  async getPersonaVersion(
    agentId: string,
    version: number,
  ): Promise<PersonaVersion | null> {
    const result = await this.pool.query<PersonaRow>(
      `
        SELECT agent_id, version, content, created_at
        FROM persona_versions
        WHERE agent_id = $1 AND version = $2
      `,
      [agentId, version],
    );
    const row = result.rows[0];
    return row ? rowToPersona(row) : null;
  }

  async getCurrentPersona(agentId: string): Promise<PersonaVersion | null> {
    const agent = await this.get(agentId);
    if (!agent) {
      return null;
    }
    return this.getPersonaVersion(agentId, agent.currentPersonaVersion);
  }

  async listPersonas(agentId: string): Promise<PersonaVersion[]> {
    if (!(await this.get(agentId))) {
      return [];
    }
    const result = await this.pool.query<PersonaRow>(
      `
        SELECT agent_id, version, content, created_at
        FROM persona_versions
        WHERE agent_id = $1
        ORDER BY version DESC
      `,
      [agentId],
    );
    return result.rows.map(rowToPersona);
  }

  async delete(agentId: string): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const existing = await client.query(
        "SELECT 1 FROM agents WHERE id = $1",
        [agentId],
      );
      if (existing.rowCount === 0) {
        return false;
      }

      await client.query(
        "DELETE FROM bearer_agent_grants WHERE agent_id = $1",
        [agentId],
      );
      await client.query("DELETE FROM persona_versions WHERE agent_id = $1", [
        agentId,
      ]);
      await client.query("DELETE FROM agents WHERE id = $1", [agentId]);
      return true;
    });
  }
}
