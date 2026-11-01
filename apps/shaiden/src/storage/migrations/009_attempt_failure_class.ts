import type { Migration } from "@keidai/postgres";

/** Failure class stamped at termination. Null on rows written before this column. */
export const migration009AttemptFailureClass: Migration = {
  id: "009_attempt_failure_class",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE run_attempts
        ADD COLUMN failure_class TEXT;

      ALTER TABLE run_attempts
        ADD CONSTRAINT run_attempts_failure_class_check
        CHECK (
          failure_class IS NULL
          OR failure_class IN ('platform', 'agent', 'limit', 'human')
        );

      COMMENT ON COLUMN run_attempts.failure_class IS
        'platform, agent, limit, or human. Null for goal_met, stopped, and outcomes written before the class existed.';
    `);
  },
};
