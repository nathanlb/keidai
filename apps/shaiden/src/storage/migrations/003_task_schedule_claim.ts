import type { Migration } from "@keidai/postgres";

/**
 * Claim/failure columns for the schedule dispatcher. Some environments applied
 * an earlier 002 that only added `next_run_at`; this is additive and idempotent.
 */
export const migration003TaskScheduleClaim: Migration = {
  id: "003_task_schedule_claim",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS schedule_claim_until TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS schedule_start_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS schedule_failed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS schedule_error TEXT;

      DROP INDEX IF EXISTS idx_tasks_due;
      CREATE INDEX idx_tasks_due ON tasks (next_run_at)
        WHERE next_run_at IS NOT NULL
          AND archived_at IS NULL
          AND schedule_failed_at IS NULL;
    `);
  },
};
