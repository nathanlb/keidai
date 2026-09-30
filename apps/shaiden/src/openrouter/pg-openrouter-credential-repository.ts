import { toIso, type Pool } from "@keidai/postgres";
import type {
  OpenRouterCredentialRepository,
  StoredOpenRouterCredential,
} from "./types.js";

const CREDENTIAL_ID = "default";

interface CredentialRow {
  sealed_payload: string;
  hint: string;
  updated_at: Date | string;
}

export class PgOpenRouterCredentialRepository implements OpenRouterCredentialRepository {
  constructor(private readonly pool: Pool) {}

  async get(): Promise<StoredOpenRouterCredential | null> {
    const result = await this.pool.query<CredentialRow>(
      `
        SELECT sealed_payload, hint, updated_at
        FROM openrouter_credential
        WHERE id = $1
      `,
      [CREDENTIAL_ID],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      sealedPayload: row.sealed_payload,
      hint: row.hint,
      updatedAt: toIso(row.updated_at),
    };
  }

  async put(credential: StoredOpenRouterCredential): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO openrouter_credential (id, sealed_payload, hint, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
          SET sealed_payload = excluded.sealed_payload,
              hint = excluded.hint,
              updated_at = excluded.updated_at
      `,
      [
        CREDENTIAL_ID,
        credential.sealedPayload,
        credential.hint,
        credential.updatedAt,
      ],
    );
  }

  async clear(): Promise<void> {
    await this.pool.query(`DELETE FROM openrouter_credential WHERE id = $1`, [
      CREDENTIAL_ID,
    ]);
  }
}
