import { toIso, type Pool } from "@keidai/postgres";
import type { OwnerRecord, OwnerRepository } from "./types/owner-repository.js";

interface OwnerRow {
  owner_id: string;
  created_at: Date | string;
}

function rowToOwner(row: OwnerRow): OwnerRecord {
  return {
    ownerId: row.owner_id,
    createdAt: toIso(row.created_at),
  };
}

export class PgOwnerRepository implements OwnerRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(ownerId: string): Promise<OwnerRecord> {
    const existing = await this.get(ownerId);
    if (existing) {
      return existing;
    }

    const createdAt = new Date().toISOString();
    await this.pool.query(
      `
        INSERT INTO owners (owner_id, created_at)
        VALUES ($1, $2)
        ON CONFLICT (owner_id) DO NOTHING
      `,
      [ownerId, createdAt],
    );
    const created = await this.get(ownerId);
    if (!created) {
      throw new Error(`failed to upsert owner "${ownerId}"`);
    }
    return created;
  }

  async get(ownerId: string): Promise<OwnerRecord | null> {
    const result = await this.pool.query<OwnerRow>(
      `SELECT owner_id, created_at FROM owners WHERE owner_id = $1`,
      [ownerId],
    );
    const row = result.rows[0];
    return row ? rowToOwner(row) : null;
  }

  async list(): Promise<OwnerRecord[]> {
    const result = await this.pool.query<OwnerRow>(
      `SELECT owner_id, created_at FROM owners ORDER BY owner_id ASC`,
    );
    return result.rows.map(rowToOwner);
  }

  async delete(ownerId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM owners WHERE owner_id = $1`,
      [ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
