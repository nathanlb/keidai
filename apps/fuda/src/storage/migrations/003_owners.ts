import type { Migration } from "../migrate.js";

/**
 * Platform owners table. Opaque owner_id is the FK target for agents;
 * Google bindings live only in operators.yaml / the BFF.
 */
export const migration003Owners: Migration = {
  id: "003_owners",
  up(db) {
    db.exec(`
      CREATE TABLE owners (
        owner_id TEXT NOT NULL PRIMARY KEY,
        created_at TEXT NOT NULL
      );

      INSERT OR IGNORE INTO owners (owner_id, created_at)
      SELECT DISTINCT owner_id, COALESCE(MIN(created_at), datetime('now'))
      FROM agents
      GROUP BY owner_id;
    `);
  },
};
