import type { Migration } from "@keidai/postgres";

/**
 * Group policy as a Torii Postgres entity: group meaning plus per-server
 * default/allow/deny/gated lists.
 */
export const migration002GroupPolicies: Migration = {
  id: "002_group_policies",
  async up(queryable) {
    await queryable.query(`
      CREATE TABLE groups (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE group_server_policies (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        server TEXT NOT NULL,
        default_effect TEXT NOT NULL CHECK (default_effect IN ('allow', 'deny')),
        allow_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
        deny_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
        gated_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
        PRIMARY KEY (group_id, server)
      );
    `);
  },
};
