import { toIso, type Pool } from "@keidai/postgres";
import { parseJsonValue } from "../storage/pg-values.js";
import type {
  ConnectorAuthMode,
  ConnectorOAuthOverride,
  ConnectorRecord,
} from "@keidai/shared";

interface ConnectorRow {
  slug: string;
  display_name: string;
  url: string;
  transport_type: "http";
  auth_mode: ConnectorAuthMode;
  enabled: boolean;
  catalog_id: string | null;
  catalog_version: string | null;
  icon: string | null;
  service_key_ref: string | null;
  service_key_header: string | null;
  oauth_override: ConnectorOAuthOverride | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function rowToConnector(row: ConnectorRow): ConnectorRecord {
  const oauthOverride =
    row.oauth_override === null
      ? undefined
      : parseJsonValue<ConnectorOAuthOverride>(row.oauth_override);
  return {
    slug: row.slug,
    displayName: row.display_name,
    url: row.url,
    transportType: row.transport_type,
    authMode: row.auth_mode,
    enabled: row.enabled,
    ...(row.catalog_id ? { catalogId: row.catalog_id } : {}),
    ...(row.catalog_version ? { catalogVersion: row.catalog_version } : {}),
    ...(row.icon ? { icon: row.icon } : {}),
    ...(row.service_key_ref ? { serviceKeyRef: row.service_key_ref } : {}),
    ...(row.service_key_header
      ? { serviceKeyHeader: row.service_key_header }
      : {}),
    oauth: oauthOverride
      ? { ...oauthOverride, clientSecret: undefined }
      : undefined,
    createdAt: toDate(row.created_at).toISOString(),
    updatedAt: toDate(row.updated_at).toISOString(),
  };
}

export interface ConnectorWriteInput {
  slug: string;
  displayName: string;
  url: string;
  authMode: ConnectorAuthMode;
  enabled: boolean;
  catalogId?: string;
  catalogVersion?: string;
  icon?: string;
  serviceKeyRef?: string;
  serviceKeyHeader?: string;
  oauth?: ConnectorOAuthOverride;
}

export class PgConnectorRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<ConnectorRecord[]> {
    const result = await this.pool.query<ConnectorRow>(
      `
        SELECT slug, display_name, url, transport_type, auth_mode, enabled,
               catalog_id, catalog_version, icon, service_key_ref,
               service_key_header, oauth_override, created_at, updated_at
        FROM connectors
        ORDER BY display_name ASC
      `,
    );
    return result.rows.map(rowToConnector);
  }

  async get(slug: string): Promise<ConnectorRecord | null> {
    const result = await this.pool.query<ConnectorRow>(
      `
        SELECT slug, display_name, url, transport_type, auth_mode, enabled,
               catalog_id, catalog_version, icon, service_key_ref,
               service_key_header, oauth_override, created_at, updated_at
        FROM connectors
        WHERE slug = $1
      `,
      [slug],
    );
    const row = result.rows[0];
    return row ? rowToConnector(row) : null;
  }

  async insert(input: ConnectorWriteInput): Promise<ConnectorRecord> {
    const now = new Date();
    await this.pool.query(
      `
        INSERT INTO connectors (
          slug, display_name, url, transport_type, auth_mode, enabled,
          catalog_id, catalog_version, icon, service_key_ref,
          service_key_header, oauth_override, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'http', $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $12)
      `,
      [
        input.slug,
        input.displayName,
        input.url,
        input.authMode,
        input.enabled,
        input.catalogId ?? null,
        input.catalogVersion ?? null,
        input.icon ?? null,
        input.serviceKeyRef ?? null,
        input.serviceKeyHeader ?? null,
        input.oauth ? JSON.stringify(stripSecret(input.oauth)) : null,
        toIso(now),
      ],
    );
    const created = await this.get(input.slug);
    if (!created) {
      throw new Error(`Failed to insert connector "${input.slug}"`);
    }
    return created;
  }

  async update(
    slug: string,
    input: Partial<ConnectorWriteInput>,
  ): Promise<ConnectorRecord | null> {
    const existing = await this.get(slug);
    if (!existing) {
      return null;
    }
    const now = new Date();
    await this.pool.query(
      `
        UPDATE connectors SET
          display_name = $2,
          url = $3,
          auth_mode = $4,
          enabled = $5,
          catalog_id = $6,
          catalog_version = $7,
          icon = $8,
          service_key_ref = $9,
          service_key_header = $10,
          oauth_override = $11::jsonb,
          updated_at = $12
        WHERE slug = $1
      `,
      [
        slug,
        input.displayName ?? existing.displayName,
        input.url ?? existing.url,
        input.authMode ?? existing.authMode,
        input.enabled ?? existing.enabled,
        input.catalogId ?? existing.catalogId ?? null,
        input.catalogVersion ?? existing.catalogVersion ?? null,
        input.icon ?? existing.icon ?? null,
        input.serviceKeyRef !== undefined
          ? input.serviceKeyRef
          : (existing.serviceKeyRef ?? null),
        input.serviceKeyHeader !== undefined
          ? input.serviceKeyHeader
          : (existing.serviceKeyHeader ?? null),
        input.oauth !== undefined
          ? input.oauth
            ? JSON.stringify(stripSecret(input.oauth))
            : null
          : existing.oauth
            ? JSON.stringify(stripSecret(existing.oauth))
            : null,
        toIso(now),
      ],
    );
    return this.get(slug);
  }

  async delete(slug: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM connectors WHERE slug = $1`,
      [slug],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function stripSecret(
  oauth: ConnectorOAuthOverride,
): ConnectorOAuthOverride {
  const { clientSecret: _secret, ...rest } = oauth;
  return rest;
}
