import type { Migration } from "../migrate.js";

/**
 * Domain tables for the agent registry: agents, append-only persona versions,
 * credential-agnostic bearers, and bearer→agent grants.
 */
export const migration002AgentSchema: Migration = {
  id: "002_agent_schema",
  up(db) {
    db.exec(`
      CREATE TABLE agents (
        id TEXT NOT NULL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        groups_json TEXT NOT NULL,
        current_persona_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE persona_versions (
        agent_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (agent_id, version),
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );

      CREATE TABLE bearers (
        bearer_id TEXT NOT NULL PRIMARY KEY,
        display_name TEXT NOT NULL
      );

      CREATE TABLE bearer_agent_grants (
        bearer_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        PRIMARY KEY (bearer_id, agent_id),
        FOREIGN KEY (bearer_id) REFERENCES bearers(bearer_id),
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );
    `);
  },
};
