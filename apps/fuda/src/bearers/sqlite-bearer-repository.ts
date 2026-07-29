import type { DatabaseSync } from "node:sqlite";
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

export class SqliteBearerRepository implements BearerRepository {
  private readonly insertBearerStatement;
  private readonly getBearerStatement;
  private readonly listBearersStatement;
  private readonly updateDisplayNameStatement;
  private readonly insertGrantStatement;
  private readonly deleteGrantStatement;
  private readonly listGrantsForBearerStatement;
  private readonly listGrantsForAgentStatement;
  private readonly hasGrantStatement;

  constructor(private readonly db: DatabaseSync) {
    this.insertBearerStatement = db.prepare(`
      INSERT INTO bearers (bearer_id, display_name)
      VALUES (@bearer_id, @display_name)
    `);
    this.getBearerStatement = db.prepare(`
      SELECT bearer_id, display_name FROM bearers WHERE bearer_id = ?
    `);
    this.listBearersStatement = db.prepare(`
      SELECT bearer_id, display_name FROM bearers ORDER BY bearer_id ASC
    `);
    this.updateDisplayNameStatement = db.prepare(`
      UPDATE bearers SET display_name = @display_name WHERE bearer_id = @bearer_id
    `);
    this.insertGrantStatement = db.prepare(`
      INSERT INTO bearer_agent_grants (bearer_id, agent_id)
      VALUES (@bearer_id, @agent_id)
    `);
    this.deleteGrantStatement = db.prepare(`
      DELETE FROM bearer_agent_grants
      WHERE bearer_id = @bearer_id AND agent_id = @agent_id
    `);
    this.listGrantsForBearerStatement = db.prepare(`
      SELECT bearer_id, agent_id
      FROM bearer_agent_grants
      WHERE bearer_id = ?
      ORDER BY agent_id ASC
    `);
    this.listGrantsForAgentStatement = db.prepare(`
      SELECT bearer_id, agent_id
      FROM bearer_agent_grants
      WHERE agent_id = ?
      ORDER BY bearer_id ASC
    `);
    this.hasGrantStatement = db.prepare(`
      SELECT 1 AS found
      FROM bearer_agent_grants
      WHERE bearer_id = ? AND agent_id = ?
      LIMIT 1
    `);
  }

  create(input: CreateBearerInput): BearerRecord {
    this.insertBearerStatement.run({
      bearer_id: input.bearerId,
      display_name: input.displayName,
    });
    return {
      bearerId: input.bearerId,
      displayName: input.displayName,
    };
  }

  get(bearerId: string): BearerRecord | null {
    const row = this.getBearerStatement.get(bearerId) as BearerRow | undefined;
    return row ? rowToBearer(row) : null;
  }

  list(): BearerRecord[] {
    const rows = this.listBearersStatement.all() as unknown as BearerRow[];
    return rows.map(rowToBearer);
  }

  updateDisplayName(
    bearerId: string,
    displayName: string,
  ): BearerRecord | null {
    const existing = this.get(bearerId);
    if (!existing) {
      return null;
    }
    this.updateDisplayNameStatement.run({
      bearer_id: bearerId,
      display_name: displayName,
    });
    return { bearerId, displayName };
  }

  grant(bearerId: string, agentId: string): BearerAgentGrant {
    this.insertGrantStatement.run({
      bearer_id: bearerId,
      agent_id: agentId,
    });
    return { bearerId, agentId };
  }

  revoke(bearerId: string, agentId: string): boolean {
    const result = this.deleteGrantStatement.run({
      bearer_id: bearerId,
      agent_id: agentId,
    });
    return Number(result.changes) > 0;
  }

  listGrantsForBearer(bearerId: string): BearerAgentGrant[] {
    const rows = this.listGrantsForBearerStatement.all(
      bearerId,
    ) as unknown as GrantRow[];
    return rows.map(rowToGrant);
  }

  listGrantsForAgent(agentId: string): BearerAgentGrant[] {
    const rows = this.listGrantsForAgentStatement.all(
      agentId,
    ) as unknown as GrantRow[];
    return rows.map(rowToGrant);
  }

  hasGrant(bearerId: string, agentId: string): boolean {
    const row = this.hasGrantStatement.get(bearerId, agentId) as
      | { found: number }
      | undefined;
    return row !== undefined;
  }
}
