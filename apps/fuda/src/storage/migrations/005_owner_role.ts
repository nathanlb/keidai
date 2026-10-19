import type { Migration } from "@keidai/postgres";

/**
 * Operator role for RBAC. Existing installs with no admin are promoted so
 * the workspace is not locked out of settings: every active owner, or the
 * earliest owner when none are active.
 */
export const migration005OwnerRole: Migration = {
  id: "005_owner_role",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE owners
        ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

      ALTER TABLE owners
        DROP CONSTRAINT IF EXISTS owners_role_check;
      ALTER TABLE owners
        ADD CONSTRAINT owners_role_check
        CHECK (role IN ('admin', 'member'));

      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM owners)
           AND NOT EXISTS (SELECT 1 FROM owners WHERE role = 'admin') THEN
          IF EXISTS (SELECT 1 FROM owners WHERE status = 'active') THEN
            UPDATE owners SET role = 'admin' WHERE status = 'active';
          ELSE
            UPDATE owners
            SET role = 'admin'
            WHERE owner_id = (
              SELECT owner_id
              FROM owners
              ORDER BY created_at ASC, owner_id ASC
              LIMIT 1
            );
          END IF;
        END IF;
      END $$;
    `);
  },
};
