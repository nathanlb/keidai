import type { DatabaseSync } from "node:sqlite";
import { injectable } from "tsyringe";
import type {
  OAuthToken,
  StoredOAuthGrant,
  TokenRepository,
} from "./types/token-repository.js";

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
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

@injectable()
export class SqliteTokenRepository implements TokenRepository {
  private readonly getStatement;
  private readonly listByOwnerStatement;
  private readonly deleteStatement;
  private readonly upsertStatement;

  constructor(private readonly db: DatabaseSync) {
    this.getStatement = db.prepare(`
      SELECT access_token, refresh_token, expires_at
      FROM oauth_tokens
      WHERE owner_id = ? AND provider = ?
    `);
    this.listByOwnerStatement = db.prepare(`
      SELECT provider, access_token, refresh_token, expires_at
      FROM oauth_tokens
      WHERE owner_id = ?
    `);
    this.deleteStatement = db.prepare(`
      DELETE FROM oauth_tokens
      WHERE owner_id = ? AND provider = ?
    `);
    this.upsertStatement = db.prepare(`
      INSERT INTO oauth_tokens (
        owner_id,
        provider,
        access_token,
        refresh_token,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, provider) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at
    `);
  }

  async get(ownerId: string, provider: string): Promise<OAuthToken | null> {
    const row = this.getStatement.get(ownerId, provider) as TokenRow | undefined;
    return row ? rowToToken(row) : null;
  }

  async set(
    ownerId: string,
    provider: string,
    token: OAuthToken,
  ): Promise<void> {
    this.upsertStatement.run(
      ownerId,
      provider,
      token.accessToken,
      token.refreshToken ?? null,
      token.expiresAt?.toISOString() ?? null,
    );
  }

  async delete(ownerId: string, provider: string): Promise<boolean> {
    const result = this.deleteStatement.run(ownerId, provider);
    return (result.changes ?? 0) > 0;
  }

  async listByOwner(ownerId: string): Promise<StoredOAuthGrant[]> {
    const rows = this.listByOwnerStatement.all(ownerId) as unknown as ListByOwnerRow[];
    return rows.map((row) => ({
      provider: row.provider,
      token: rowToToken(row),
    }));
  }
}
