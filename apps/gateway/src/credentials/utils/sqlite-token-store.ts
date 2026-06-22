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
`;

export function openTokenDatabase(databasePath: string): DatabaseSync {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}
