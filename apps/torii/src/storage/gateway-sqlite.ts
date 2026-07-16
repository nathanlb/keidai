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

export function openGatewayDatabase(databasePath: string): DatabaseSync {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  ensureOAuthClientRedirectUriColumn(db);
  ensureCallTraceCorrelationColumns(db);
  return db;
}
