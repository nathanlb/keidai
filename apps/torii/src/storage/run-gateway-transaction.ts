import type { DatabaseSync } from "node:sqlite";

export function runGatewayTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The connection may already have rolled back.
    }
    throw error;
  }
}
