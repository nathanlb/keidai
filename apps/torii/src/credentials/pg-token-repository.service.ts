import { toIso, type Pool } from "@keidai/postgres";
import type {
  OAuthToken,
  StoredOAuthGrant,
  TokenRepository,
} from "./types/token-repository.js";

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | string | null;
}

interface ListByOwnerRow extends TokenRow {
  provider: string;
}

function rowToToken(row: TokenRow): OAuthToken {
  return {
    accessToken: row.access_token,
    ...(row.refresh_token !== null ? { refreshToken: row.refresh_token } : {}),
    ...(row.expires_at !== null ? { expiresAt: new Date(row.expires_at) } : {}),
  };
}

export class PgTokenRepository implements TokenRepository {
  constructor(private readonly pool: Pool) {}

  async get(ownerId: string, provider: string): Promise<OAuthToken | null> {
    const result = await this.pool.query<TokenRow>(
      `
        SELECT access_token, refresh_token, expires_at
        FROM oauth_tokens
        WHERE owner_id = $1 AND provider = $2
      `,
      [ownerId, provider],
    );
    const row = result.rows[0];
    return row ? rowToToken(row) : null;
  }

  async set(
    ownerId: string,
    provider: string,
    token: OAuthToken,
  ): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO oauth_tokens (
          owner_id,
          provider,
          access_token,
          refresh_token,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (owner_id, provider) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at
      `,
      [
        ownerId,
        provider,
        token.accessToken,
        token.refreshToken ?? null,
        token.expiresAt ? toIso(token.expiresAt) : null,
      ],
    );
  }

  async delete(ownerId: string, provider: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        DELETE FROM oauth_tokens
        WHERE owner_id = $1 AND provider = $2
      `,
      [ownerId, provider],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listByOwner(ownerId: string): Promise<StoredOAuthGrant[]> {
    const result = await this.pool.query<ListByOwnerRow>(
      `
        SELECT provider, access_token, refresh_token, expires_at
        FROM oauth_tokens
        WHERE owner_id = $1
      `,
      [ownerId],
    );
    return result.rows.map((row) => ({
      provider: row.provider,
      token: rowToToken(row),
    }));
  }

  async listOwnerIds(): Promise<string[]> {
    const result = await this.pool.query<{ owner_id: string }>(
      `SELECT DISTINCT owner_id FROM oauth_tokens`,
    );
    return result.rows.map((row) => row.owner_id);
  }

  async deleteByOwner(ownerId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM oauth_tokens WHERE owner_id = $1`,
      [ownerId],
    );
    return result.rowCount ?? 0;
  }
}
