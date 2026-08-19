import type { Migration } from "@keidai/postgres";

/**
 * Greenfield Shaiden schema: tasks, runs, partitioned run steps, follow-ups.
 */
export const migration001Baseline: Migration = {
  id: "001_baseline",
  async up(queryable) {
    await queryable.query(`
      CREATE TABLE tasks (
        id TEXT NOT NULL PRIMARY KEY,
        goal TEXT NOT NULL,
        trigger_json JSONB NOT NULL,
        assignee TEXT NOT NULL,
        limits_json JSONB,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        archived_at TIMESTAMPTZ
      );
      CREATE INDEX idx_tasks_updated_at ON tasks(updated_at DESC, id DESC);

      CREATE TABLE runs (
        id TEXT NOT NULL PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        task_snapshot_json JSONB NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        assignee TEXT NOT NULL,
        goal_preview TEXT NOT NULL,
        status TEXT NOT NULL,
        outcome_json JSONB,
        step_count INTEGER NOT NULL DEFAULT 0,
        persona_version INTEGER,
        persona TEXT,
        conversation_history_json JSONB,
        mcp_task_id TEXT,
        mcp_task_poll_interval_ms INTEGER,
        owner_id TEXT,
        lease_expires_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX idx_runs_started_at ON runs(started_at DESC, id DESC);
      CREATE UNIQUE INDEX idx_runs_one_running_per_task
        ON runs(task_id) WHERE status = 'running';

      CREATE TABLE run_steps (
        id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES runs(id),
        timestamp TIMESTAMPTZ NOT NULL,
        kind TEXT NOT NULL,
        payload_json JSONB NOT NULL,
        PRIMARY KEY (timestamp, id)
      ) PARTITION BY RANGE (timestamp);

      CREATE INDEX idx_run_steps_run_id ON run_steps(run_id, timestamp ASC, id ASC);

      CREATE TABLE run_follow_ups (
        id TEXT NOT NULL PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX idx_run_follow_ups_run_id
        ON run_follow_ups(run_id, created_at ASC, id ASC);
    `);
  },
};
