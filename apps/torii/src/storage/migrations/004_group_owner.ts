import type { Migration } from "@keidai/postgres";

/** Custom groups can be owned by the operator who created them. */
export const migration004GroupOwner: Migration = {
  id: "004_group_owner",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE groups
        ADD COLUMN IF NOT EXISTS owner_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_groups_owner_id ON groups(owner_id);
    `);
  },
};
