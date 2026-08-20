import { withTransaction, type Pool } from "@keidai/postgres";
import type {
  BearerAgentGrant,
  BearerRecord,
  BearerRepository,
  CreateBearerInput,
} from "./types/bearer-repository.js";

interface BearerRow {
  bearer_id: string;
  display_name: string;
}

interface GrantRow {
  bearer_id: string;
  agent_id: string;
}

function rowToBearer(row: BearerRow): BearerRecord {
  return {
    bearerId: row.bearer_id,
    displayName: row.display_name,
  };
}

function rowToGrant(row: GrantRow): BearerAgentGrant {
  return {
    bearerId: row.bearer_id,
    agentId: row.agent_id,
  };
}

export class PgBearerRepository implements BearerRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateBearerInput): Promise<BearerRecord> {
    await this.pool.query(
      `INSERT INTO bearers (bearer_id, display_name) VALUES ($1, $2)`,
      [input.bearerId, input.displayName],
    );
    return {
      bearerId: input.bearerId,
      displayName: input.displayName,
    };
  }

  async get(bearerId: string): Promise<BearerRecord | null> {
    const result = await this.pool.query<BearerRow>(
      `SELECT bearer_id, display_name FROM bearers WHERE bearer_id = $1`,
      [bearerId],
    );
    const row = result.rows[0];
    return row ? rowToBearer(row) : null;
  }

  async list(): Promise<BearerRecord[]> {
    const result = await this.pool.query<BearerRow>(
      `SELECT bearer_id, display_name FROM bearers ORDER BY bearer_id ASC`,
    );
    return result.rows.map(rowToBearer);
  }

  async updateDisplayName(
    bearerId: string,
    displayName: string,
  ): Promise<BearerRecord | null> {
    const existing = await this.get(bearerId);
    if (!existing) {
      return null;
    }
    await this.pool.query(
      `UPDATE bearers SET display_name = $1 WHERE bearer_id = $2`,
      [displayName, bearerId],
    );
    return { bearerId, displayName };
  }

  async grant(bearerId: string, agentId: string): Promise<BearerAgentGrant> {
    await this.pool.query(
      `INSERT INTO bearer_agent_grants (bearer_id, agent_id) VALUES ($1, $2)`,
      [bearerId, agentId],
    );
    return { bearerId, agentId };
  }

  async ensureGrant(
    bearerId: string,
    agentId: string,
  ): Promise<BearerAgentGrant> {
    await this.pool.query(
      `
        INSERT INTO bearer_agent_grants (bearer_id, agent_id)
        VALUES ($1, $2)
        ON CONFLICT (bearer_id, agent_id) DO NOTHING
      `,
      [bearerId, agentId],
    );
    return { bearerId, agentId };
  }

  async revoke(bearerId: string, agentId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM bearer_agent_grants WHERE bearer_id = $1 AND agent_id = $2`,
      [bearerId, agentId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listGrantsForBearer(bearerId: string): Promise<BearerAgentGrant[]> {
    const result = await this.pool.query<GrantRow>(
      `
        SELECT bearer_id, agent_id
        FROM bearer_agent_grants
        WHERE bearer_id = $1
        ORDER BY agent_id ASC
      `,
      [bearerId],
    );
    return result.rows.map(rowToGrant);
  }

  async listGrantsForAgent(agentId: string): Promise<BearerAgentGrant[]> {
    const result = await this.pool.query<GrantRow>(
      `
        SELECT bearer_id, agent_id
        FROM bearer_agent_grants
        WHERE agent_id = $1
        ORDER BY bearer_id ASC
      `,
      [agentId],
    );
    return result.rows.map(rowToGrant);
  }

  async hasGrant(bearerId: string, agentId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        SELECT 1 AS found
        FROM bearer_agent_grants
        WHERE bearer_id = $1 AND agent_id = $2
        LIMIT 1
      `,
      [bearerId, agentId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(bearerId: string): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const existing = await client.query(
        `SELECT 1 FROM bearers WHERE bearer_id = $1`,
        [bearerId],
      );
      if (existing.rowCount === 0) {
        return false;
      }

      await client.query(
        `DELETE FROM bearer_agent_grants WHERE bearer_id = $1`,
        [bearerId],
      );
      await client.query(`DELETE FROM bearers WHERE bearer_id = $1`, [
        bearerId,
      ]);
      return true;
    });
  }
}
