import { toIso, type Pool } from "@keidai/postgres";
import { parseJsonValue } from "../storage/pg-values.js";
import type {
  AuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/client";

export interface OAuthDiscoveryRecord {
  resource: string;
  issuer: string;
  authorizationServerUrl: string;
  authorizationServerMetadata?: AuthorizationServerMetadata;
  resourceMetadata?: OAuthProtectedResourceMetadata;
  fetchedAt: string;
}

interface DiscoveryRow {
  resource: string;
  issuer: string;
  authorization_server_url: string;
  authorization_server_metadata: AuthorizationServerMetadata | string | null;
  resource_metadata: OAuthProtectedResourceMetadata | string | null;
  fetched_at: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export class PgOAuthDiscoveryCache {
  constructor(private readonly pool: Pool) {}

  async get(resource: string): Promise<OAuthDiscoveryRecord | null> {
    const result = await this.pool.query<DiscoveryRow>(
      `
        SELECT resource, issuer, authorization_server_url,
               authorization_server_metadata, resource_metadata, fetched_at
        FROM oauth_discovery_cache
        WHERE resource = $1
      `,
      [resource],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      resource: row.resource,
      issuer: row.issuer,
      authorizationServerUrl: row.authorization_server_url,
      ...(row.authorization_server_metadata
        ? {
            authorizationServerMetadata:
              parseJsonValue<AuthorizationServerMetadata>(
                row.authorization_server_metadata,
              ),
          }
        : {}),
      ...(row.resource_metadata
        ? {
            resourceMetadata: parseJsonValue<OAuthProtectedResourceMetadata>(
              row.resource_metadata,
            ),
          }
        : {}),
      fetchedAt: toDate(row.fetched_at).toISOString(),
    };
  }

  async set(record: OAuthDiscoveryRecord): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO oauth_discovery_cache (
          resource, issuer, authorization_server_url,
          authorization_server_metadata, resource_metadata, fetched_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
        ON CONFLICT (resource) DO UPDATE SET
          issuer = excluded.issuer,
          authorization_server_url = excluded.authorization_server_url,
          authorization_server_metadata = excluded.authorization_server_metadata,
          resource_metadata = excluded.resource_metadata,
          fetched_at = excluded.fetched_at
      `,
      [
        record.resource,
        record.issuer,
        record.authorizationServerUrl,
        record.authorizationServerMetadata
          ? JSON.stringify(record.authorizationServerMetadata)
          : null,
        record.resourceMetadata
          ? JSON.stringify(record.resourceMetadata)
          : null,
        toIso(new Date(record.fetchedAt)),
      ],
    );
  }
}
