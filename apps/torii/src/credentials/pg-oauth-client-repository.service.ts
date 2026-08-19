import type { Pool } from "@keidai/postgres";
import type {
  OAuthClientRepository,
  OAuthProviderClient,
} from "./types/oauth-client-repository.js";

interface ClientRow {
  client_id: string;
  client_secret: string | null;
  redirect_uri: string | null;
}

export class PgOAuthClientRepository implements OAuthClientRepository {
  constructor(private readonly pool: Pool) {}

  async get(provider: string): Promise<OAuthProviderClient | null> {
    const result = await this.pool.query<ClientRow>(
      `
        SELECT client_id, client_secret, redirect_uri
        FROM oauth_provider_clients
        WHERE provider = $1
      `,
      [provider],
    );
    const row = result.rows[0];
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
    await this.pool.query(
      `
        INSERT INTO oauth_provider_clients (provider, client_id, client_secret, redirect_uri)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (provider) DO UPDATE SET
          client_id = excluded.client_id,
          client_secret = excluded.client_secret,
          redirect_uri = excluded.redirect_uri
      `,
      [
        provider,
        client.clientId,
        client.clientSecret ?? null,
        client.redirectUri ?? null,
      ],
    );
  }
}
