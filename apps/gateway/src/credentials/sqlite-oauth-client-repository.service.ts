import type { DatabaseSync } from "node:sqlite";
import { injectable } from "tsyringe";
import type {
  OAuthClientRepository,
  OAuthProviderClient,
} from "./types/oauth-client-repository.js";

interface ClientRow {
  client_id: string;
  client_secret: string | null;
  redirect_uri: string | null;
}

@injectable()
export class SqliteOAuthClientRepository implements OAuthClientRepository {
  private readonly getStatement;
  private readonly upsertStatement;

  constructor(private readonly db: DatabaseSync) {
    this.getStatement = db.prepare(`
      SELECT client_id, client_secret, redirect_uri
      FROM oauth_provider_clients
      WHERE provider = ?
    `);
    this.upsertStatement = db.prepare(`
      INSERT INTO oauth_provider_clients (provider, client_id, client_secret, redirect_uri)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        client_id = excluded.client_id,
        client_secret = excluded.client_secret,
        redirect_uri = excluded.redirect_uri
    `);
  }

  async get(provider: string): Promise<OAuthProviderClient | null> {
    const row = this.getStatement.get(provider) as ClientRow | undefined;
    if (!row) {
      return null;
    }

    return {
      clientId: row.client_id,
      ...(row.client_secret !== null ? { clientSecret: row.client_secret } : {}),
      ...(row.redirect_uri !== null ? { redirectUri: row.redirect_uri } : {}),
    };
  }

  async set(provider: string, client: OAuthProviderClient): Promise<void> {
    this.upsertStatement.run(
      provider,
      client.clientId,
      client.clientSecret ?? null,
      client.redirectUri ?? null,
    );
  }
}
