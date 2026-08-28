import { toIso, type Pool } from "@keidai/postgres";
import type {
  SecretRepository,
  StoredSecret,
  SecretKind,
} from "./secret-store.js";

interface SecretRow {
  id: string;
  kind: SecretKind;
  payload: string;
  hint: string | null;
  created_at: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export class PgSecretRepository implements SecretRepository {
  constructor(private readonly pool: Pool) {}

  async get(id: string): Promise<StoredSecret | null> {
    const result = await this.pool.query<SecretRow>(
      `SELECT id, kind, payload, hint, created_at FROM secrets WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      kind: row.kind,
      payload: row.payload,
      ...(row.hint ? { hint: row.hint } : {}),
      createdAt: toDate(row.created_at),
    };
  }

  async insert(secret: StoredSecret): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO secrets (id, kind, payload, hint, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        secret.id,
        secret.kind,
        secret.payload,
        secret.hint ?? null,
        toIso(secret.createdAt),
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM secrets WHERE id = $1`, [id]);
  }
}
