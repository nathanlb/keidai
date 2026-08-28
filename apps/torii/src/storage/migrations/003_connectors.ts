import type { Migration } from "@keidai/postgres";

/**
 * DB-managed connectors, issuer-keyed OAuth client registrations, sealed
 * secrets, and OAuth discovery cache.
 */
export const migration003Connectors: Migration = {
  id: "003_connectors",
  async up(queryable) {
    await queryable.query(`
      CREATE TABLE secrets (
        id TEXT NOT NULL PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('sealed', 'env_ref')),
        payload TEXT NOT NULL,
        hint TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE connectors (
        slug TEXT NOT NULL PRIMARY KEY,
        display_name TEXT NOT NULL,
        url TEXT NOT NULL,
        transport_type TEXT NOT NULL DEFAULT 'http',
        auth_mode TEXT NOT NULL CHECK (auth_mode IN ('user_oauth', 'service_key', 'none')),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        catalog_id TEXT,
        catalog_version TEXT,
        icon TEXT,
        service_key_ref TEXT REFERENCES secrets(id) ON DELETE SET NULL,
        service_key_header TEXT,
        oauth_override JSONB,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE oauth_client_registrations (
        issuer TEXT NOT NULL PRIMARY KEY,
        client_id TEXT NOT NULL,
        client_secret_ref TEXT REFERENCES secrets(id) ON DELETE SET NULL,
        redirect_uri TEXT,
        origin TEXT NOT NULL CHECK (origin IN ('dcr', 'manual', 'cimd')),
        scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE oauth_discovery_cache (
        resource TEXT NOT NULL PRIMARY KEY,
        issuer TEXT NOT NULL,
        authorization_server_url TEXT NOT NULL,
        authorization_server_metadata JSONB,
        resource_metadata JSONB,
        fetched_at TIMESTAMPTZ NOT NULL
      );
    `);
  },
};
