import { DatabaseSync } from "node:sqlite";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS oauth_tokens (
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  PRIMARY KEY (owner_id, provider)
);

CREATE TABLE IF NOT EXISTS oauth_provider_clients (
  provider TEXT NOT NULL PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret TEXT
);

CREATE TABLE IF NOT EXISTS call_traces (
  trace_id TEXT NOT NULL PRIMARY KEY,
  timestamp TEXT NOT NULL,
  server TEXT NOT NULL,
  tool TEXT NOT NULL,
  agent_id TEXT,
  owner_id TEXT,
  credential_ref TEXT,
  policy_decision TEXT NOT NULL,
  duration_ms INTEGER,
  error TEXT,
  run_id TEXT,
  step_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_call_traces_timestamp
  ON call_traces(timestamp DESC, trace_id DESC);
CREATE INDEX IF NOT EXISTS idx_call_traces_server
  ON call_traces(server);

CREATE TABLE IF NOT EXISTS pending_oauth_links (
  link_id TEXT NOT NULL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  code_verifier TEXT,
  redirect_uri TEXT NOT NULL,
  ui_origin TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_oauth_links_owner_provider_created
  ON pending_oauth_links(owner_id, provider, created_at DESC);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT NOT NULL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  params TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  run_id TEXT,
  step_id TEXT,
  task_id TEXT UNIQUE,
  status TEXT NOT NULL,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  decided_at INTEGER,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_approvals_status_created
  ON approvals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS approval_rejections (
  agent_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  rejection_reason TEXT,
  rejected_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, tool_name, params_hash)
);

CREATE INDEX IF NOT EXISTS idx_approval_rejections_rejected_at
  ON approval_rejections(rejected_at);

CREATE TABLE IF NOT EXISTS mcp_tasks (
  task_id TEXT NOT NULL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  request_method TEXT NOT NULL,
  status TEXT NOT NULL,
  status_message TEXT,
  created_at INTEGER NOT NULL,
  last_updated_at INTEGER NOT NULL,
  ttl_ms INTEGER,
  poll_interval_ms INTEGER,
  input_requests TEXT,
  satisfied_input_keys TEXT NOT NULL DEFAULT '[]',
  result TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_tasks_agent_created
  ON mcp_tasks(agent_id, created_at DESC);
`;

function ensureOAuthClientRedirectUriColumn(db: DatabaseSync): void {
  const columns = db
    .prepare("PRAGMA table_info(oauth_provider_clients)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "redirect_uri")) {
    db.exec("ALTER TABLE oauth_provider_clients ADD COLUMN redirect_uri TEXT");
  }
}

function ensureCallTraceCorrelationColumns(db: DatabaseSync): void {
  const columns = db
    .prepare("PRAGMA table_info(call_traces)")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("run_id")) {
    db.exec("ALTER TABLE call_traces ADD COLUMN run_id TEXT");
  }
  if (!columnNames.has("step_id")) {
    db.exec("ALTER TABLE call_traces ADD COLUMN step_id TEXT");
  }
}

function ensureApprovalsTaskIdColumn(db: DatabaseSync): void {
  const columns = db
    .prepare("PRAGMA table_info(approvals)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "task_id")) {
    db.exec("ALTER TABLE approvals ADD COLUMN task_id TEXT");
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_task_id
    ON approvals(task_id)
    WHERE task_id IS NOT NULL
  `);
}

export function openGatewayDatabase(databasePath: string): DatabaseSync {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA_SQL);
  ensureOAuthClientRedirectUriColumn(db);
  ensureCallTraceCorrelationColumns(db);
  ensureApprovalsTaskIdColumn(db);
  return db;
}
