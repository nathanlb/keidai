import type { Migration } from "@keidai/postgres";

/**
 * Owner profile for OIDC just-in-time provisioning.
 * `owner_id` stays the key used by agents, tokens, and approvals.
 * Identity columns are nullable so file-seeded owners exist before first login.
 * Postgres UNIQUE treats NULL issuer/sub pairs as distinct, so many unseeded
 * rows can omit an IdP subject until a login binds one.
 */
export const migration004OwnerIdentity: Migration = {
  id: "004_owner_identity",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE owners
        ADD COLUMN IF NOT EXISTS idp_issuer TEXT,
        ADD COLUMN IF NOT EXISTS idp_sub TEXT,
        ADD COLUMN IF NOT EXISTS email TEXT,
        ADD COLUMN IF NOT EXISTS display_name TEXT,
        ADD COLUMN IF NOT EXISTS picture_url TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

      ALTER TABLE owners
        DROP CONSTRAINT IF EXISTS owners_status_check;
      ALTER TABLE owners
        ADD CONSTRAINT owners_status_check
        CHECK (status IN ('active', 'disabled'));

      CREATE UNIQUE INDEX IF NOT EXISTS owners_idp_identity_key
        ON owners (idp_issuer, idp_sub);
    `);
  },
};
