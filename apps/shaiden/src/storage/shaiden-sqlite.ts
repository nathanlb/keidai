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
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_runs_started_at
  ON runs(started_at DESC, id DESC);

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
`;

function ensureConversationHistoryColumn(db: DatabaseSync): void {
  const columns = db
    .prepare("PRAGMA table_info(runs)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "conversation_history_json")) {
    db.exec("ALTER TABLE runs ADD COLUMN conversation_history_json TEXT");
  }
}

export function openShaidenDatabase(databasePath: string): DatabaseSync {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  ensureConversationHistoryColumn(db);
  return db;
}
