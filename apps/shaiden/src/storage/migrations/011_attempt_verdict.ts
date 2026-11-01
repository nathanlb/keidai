import type { Migration } from "@keidai/postgres";

/** Operator thumbs up/down, kept on the attempt after the run log is gone. */
export const migration011AttemptVerdict: Migration = {
  id: "011_attempt_verdict",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE run_attempts
        ADD COLUMN operator_verdict TEXT,
        ADD COLUMN operator_verdict_note TEXT,
        ADD COLUMN operator_verdict_by TEXT,
        ADD COLUMN operator_verdict_at TIMESTAMPTZ;

      ALTER TABLE run_attempts
        ADD CONSTRAINT run_attempts_verdict_check
        CHECK (
          (
            operator_verdict IS NULL
            AND operator_verdict_by IS NULL
            AND operator_verdict_at IS NULL
          )
          OR (
            operator_verdict IN ('up', 'down')
            AND operator_verdict_by IS NOT NULL
            AND operator_verdict_at IS NOT NULL
          )
        );

      COMMENT ON COLUMN run_attempts.operator_verdict IS
        'Operator thumbs up or down. Independent of self-reported goal_met. Survives run-log retention.';
    `);
  },
};
