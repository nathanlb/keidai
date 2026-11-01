import type { Migration } from "@keidai/postgres";

/**
 * One row per run outcome, retained independently of run logs.
 * No foreign key to `runs`: run-log retention deletes runs, and these rows
 * must outlive them.
 */
export const migration008RunAttempts: Migration = {
  id: "008_run_attempts",
  async up(queryable) {
    await queryable.query(`
      CREATE TABLE run_attempts (
        id TEXT NOT NULL PRIMARY KEY,
        run_id TEXT NOT NULL,
        attempt_index INTEGER NOT NULL,
        kind TEXT NOT NULL,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_owner_id TEXT,
        model_id TEXT,
        persona_version INTEGER,
        task_revision_hash TEXT NOT NULL,
        max_iterations INTEGER,
        timeout_seconds INTEGER,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ NOT NULL,
        active_ms BIGINT NOT NULL,
        iterations_used INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        outcome_reason TEXT,
        tool_counts_json JSONB NOT NULL,
        approval_request_count INTEGER NOT NULL,
        rejection_count INTEGER NOT NULL,
        backfilled BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (run_id, attempt_index),
        CONSTRAINT run_attempts_kind_check
          CHECK (kind IN ('initial', 'follow_up')),
        CONSTRAINT run_attempts_outcome_check
          CHECK (outcome IN (
            'goal_met',
            'iteration_exhausted',
            'timeout',
            'human_reject',
            'stopped',
            'failed'
          )),
        CONSTRAINT run_attempts_index_positive CHECK (attempt_index >= 1),
        CONSTRAINT run_attempts_counts_nonnegative CHECK (
          active_ms >= 0
          AND iterations_used >= 0
          AND approval_request_count >= 0
          AND rejection_count >= 0
        )
      );

      COMMENT ON COLUMN run_attempts.backfilled IS
        'True when iterations_used and active_ms were derived from steps rather than the live run budget.';
      COMMENT ON COLUMN run_attempts.kind IS
        'follow_up when an operator message started the attempt; initial otherwise, including a resume after stopped.';
      COMMENT ON COLUMN run_attempts.approval_request_count IS
        'Tool calls that waited on approval, whether later approved or rejected.';

      CREATE INDEX idx_run_attempts_task_started
        ON run_attempts (task_id, started_at);
      CREATE INDEX idx_run_attempts_agent_started
        ON run_attempts (agent_id, started_at);
      CREATE INDEX idx_run_attempts_owner_started
        ON run_attempts (agent_owner_id, started_at);
      CREATE INDEX idx_run_attempts_ended
        ON run_attempts (ended_at);
    `);
  },
};
