import type { DatabaseSync } from "node:sqlite";
import type { OwnerRecord, OwnerRepository } from "./types/owner-repository.js";

interface OwnerRow {
  owner_id: string;
  created_at: string;
}

function rowToOwner(row: OwnerRow): OwnerRecord {
  return {
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

export class SqliteOwnerRepository implements OwnerRepository {
  private readonly upsertStatement;
  private readonly getStatement;
  private readonly listStatement;
  private readonly deleteStatement;

  constructor(private readonly db: DatabaseSync) {
    this.upsertStatement = db.prepare(`
      INSERT INTO owners (owner_id, created_at)
      VALUES (@owner_id, @created_at)
      ON CONFLICT(owner_id) DO NOTHING
    `);
    this.getStatement = db.prepare(`
      SELECT owner_id, created_at FROM owners WHERE owner_id = ?
    `);
    this.listStatement = db.prepare(`
      SELECT owner_id, created_at FROM owners ORDER BY owner_id ASC
    `);
    this.deleteStatement = db.prepare(`
      DELETE FROM owners WHERE owner_id = ?
    `);
  }

  upsert(ownerId: string): OwnerRecord {
    const existing = this.get(ownerId);
    if (existing) {
      return existing;
    }

    const createdAt = new Date().toISOString();
    this.upsertStatement.run({
      owner_id: ownerId,
      created_at: createdAt,
    });
    const created = this.get(ownerId);
    if (!created) {
      throw new Error(`failed to upsert owner "${ownerId}"`);
    }
    return created;
  }

  get(ownerId: string): OwnerRecord | null {
    const row = this.getStatement.get(ownerId) as OwnerRow | undefined;
    return row ? rowToOwner(row) : null;
  }

  list(): OwnerRecord[] {
    return (this.listStatement.all() as unknown as OwnerRow[]).map(rowToOwner);
  }

  delete(ownerId: string): boolean {
    const result = this.deleteStatement.run(ownerId);
    return Number(result.changes) > 0;
  }
}
