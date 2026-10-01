import type { Migration } from "@keidai/postgres";

/**
 * Remaining-budget counters for a run. Re-entry continues from these unless a
 * follow-up message resets them. Parked approval waits are not included in
 * `active_elapsed_ms`.
 */
export const migration004RunBudgets: Migration = {
  id: "004_run_budgets",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE runs
        ADD COLUMN IF NOT EXISTS iterations_used INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS active_elapsed_ms BIGINT NOT NULL DEFAULT 0;
    `);
  },
};
