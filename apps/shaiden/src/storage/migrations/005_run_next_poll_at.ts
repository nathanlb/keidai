import type { Migration } from "@keidai/postgres";

/**
 * When a hibernated parked run is next due for a single `tasks/get`.
 * Null means due immediately. Cleared when the park ends.
 */
export const migration005RunNextPollAt: Migration = {
  id: "005_run_next_poll_at",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE runs
        ADD COLUMN IF NOT EXISTS next_poll_at TIMESTAMPTZ;
    `);
  },
};
