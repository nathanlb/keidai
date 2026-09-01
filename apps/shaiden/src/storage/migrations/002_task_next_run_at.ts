import type { Migration } from "@keidai/postgres";

export const migration002TaskNextRunAt: Migration = {
  id: "002_task_next_run_at",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE tasks
        ADD COLUMN next_run_at TIMESTAMPTZ,
        ADD COLUMN schedule_claim_until TIMESTAMPTZ,
        ADD COLUMN schedule_start_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN schedule_failed_at TIMESTAMPTZ,
        ADD COLUMN schedule_error TEXT;

      CREATE INDEX idx_tasks_due ON tasks (next_run_at)
        WHERE next_run_at IS NOT NULL
          AND archived_at IS NULL
          AND schedule_failed_at IS NULL;
    `);
  },
};
