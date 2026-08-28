import type { OAuthRegistrationOrigin } from "@keidai/shared";
import { toIso, type Pool } from "@keidai/postgres";
import { parseJsonValue } from "../storage/pg-values.js";

export interface OAuthClientRegistration {
  issuer: string;
  clientId: string;
  clientSecretRef?: string;
  resolvedClientSecret?: string;
  redirectUri?: string;
  origin: OAuthRegistrationOrigin;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OAuthRegistrationWrite {
  issuer: string;
  clientId: string;
  clientSecretRef?: string;
  redirectUri?: string;
  origin: OAuthRegistrationOrigin;
  scopes: string[];
}

interface RegistrationRow {
  issuer: string;
  client_id: string;
  client_secret_ref: string | null;
  redirect_uri: string | null;
  origin: OAuthRegistrationOrigin;
  scopes: string[] | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function rowToRegistration(row: RegistrationRow): OAuthClientRegistration {
  return {
    issuer: row.issuer,
    clientId: row.client_id,
    ...(row.client_secret_ref ? { clientSecretRef: row.client_secret_ref } : {}),
    ...(row.redirect_uri ? { redirectUri: row.redirect_uri } : {}),
    origin: row.origin,
    scopes: parseJsonValue<string[]>(row.scopes),
    createdAt: toDate(row.created_at).toISOString(),
    updatedAt: toDate(row.updated_at).toISOString(),
  };
}

export class PgOAuthRegistrationRepository {
  constructor(private readonly pool: Pool) {}

  async get(issuer: string): Promise<OAuthClientRegistration | null> {
    const result = await this.pool.query<RegistrationRow>(
      `
        SELECT issuer, client_id, client_secret_ref, redirect_uri, origin,
               scopes, created_at, updated_at
        FROM oauth_client_registrations
        WHERE issuer = $1
      `,
      [issuer],
    );
    const row = result.rows[0];
    return row ? rowToRegistration(row) : null;
  }

  async list(): Promise<OAuthClientRegistration[]> {
    const result = await this.pool.query<RegistrationRow>(
      `
        SELECT issuer, client_id, client_secret_ref, redirect_uri, origin,
               scopes, created_at, updated_at
        FROM oauth_client_registrations
        ORDER BY issuer ASC
      `,
    );
    return result.rows.map(rowToRegistration);
  }

  async upsert(input: OAuthRegistrationWrite): Promise<OAuthClientRegistration> {
    const now = new Date();
    await this.pool.query(
      `
        INSERT INTO oauth_client_registrations (
          issuer, client_id, client_secret_ref, redirect_uri, origin, scopes,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $7)
        ON CONFLICT (issuer) DO UPDATE SET
          client_id = excluded.client_id,
          client_secret_ref = excluded.client_secret_ref,
          redirect_uri = excluded.redirect_uri,
          origin = excluded.origin,
          scopes = excluded.scopes,
          updated_at = excluded.updated_at
      `,
      [
        input.issuer,
        input.clientId,
        input.clientSecretRef ?? null,
        input.redirectUri ?? null,
        input.origin,
        JSON.stringify(input.scopes),
        toIso(now),
      ],
    );
    const saved = await this.get(input.issuer);
    if (!saved) {
      throw new Error(`Failed to upsert OAuth registration for ${input.issuer}`);
    }
    return saved;
  }
}
