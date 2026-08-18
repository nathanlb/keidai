import { DatabaseSync } from "node:sqlite";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT NOT NULL PRIMARY KEY,
  goal TEXT NOT NULL,
  trigger_json TEXT NOT NULL,
  assignee TEXT NOT NULL,
  limits_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_updated_at
  ON tasks(updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT NOT NULL PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_snapshot_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  assignee TEXT NOT NULL,
  goal_preview TEXT NOT NULL,
  status TEXT NOT NULL,
  outcome_json TEXT,
  step_count INTEGER NOT NULL DEFAULT 0,
  persona_version INTEGER,
  persona TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_runs_started_at
  ON runs(started_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_running_per_task
  ON runs(task_id) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run_id
  ON run_steps(run_id, timestamp ASC, id ASC);

CREATE TABLE IF NOT EXISTS run_follow_ups (
  id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_follow_ups_run_id
  ON run_follow_ups(run_id, created_at ASC, id ASC);
`;

function ensureColumn(
  db: DatabaseSync,
  table: string,
  column: string,
  ddl: string,
): void {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(ddl);
  }
}

function ensureSchemaMigrations(db: DatabaseSync): void {
  ensureColumn(
    db,
    "runs",
    "conversation_history_json",
    "ALTER TABLE runs ADD COLUMN conversation_history_json TEXT",
  );
  ensureColumn(
    db,
    "runs",
    "persona_version",
    "ALTER TABLE runs ADD COLUMN persona_version INTEGER",
  );
  ensureColumn(
    db,
    "runs",
    "persona",
    "ALTER TABLE runs ADD COLUMN persona TEXT",
  );
  ensureColumn(
    db,
    "tasks",
    "archived_at",
    "ALTER TABLE tasks ADD COLUMN archived_at TEXT",
  );
  ensureColumn(
    db,
    "runs",
    "mcp_task_id",
    "ALTER TABLE runs ADD COLUMN mcp_task_id TEXT",
  );
  ensureColumn(
    db,
    "runs",
    "mcp_task_poll_interval_ms",
    "ALTER TABLE runs ADD COLUMN mcp_task_poll_interval_ms INTEGER",
  );
  ensureColumn(
    db,
    "runs",
    "owner_id",
    "ALTER TABLE runs ADD COLUMN owner_id TEXT",
  );
  ensureColumn(
    db,
    "runs",
    "lease_expires_at",
    "ALTER TABLE runs ADD COLUMN lease_expires_at TEXT",
  );
  ensureColumn(
    db,
    "runs",
    "updated_at",
    "ALTER TABLE runs ADD COLUMN updated_at TEXT",
  );
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_running_per_task
      ON runs(task_id) WHERE status = 'running'
  `);
}

export function openShaidenDatabase(databasePath: string): DatabaseSync {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA_SQL);
  ensureSchemaMigrations(db);
  return db;
}
