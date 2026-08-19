import type { Migration } from "@keidai/postgres";

/**
 * Greenfield Fuda schema: owners, agents, personas, bearers, grants.
 */
export const migration001Baseline: Migration = {
  id: "001_baseline",
  async up(queryable) {
    await queryable.query(`
      CREATE TABLE owners (
        owner_id TEXT NOT NULL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE agents (
        id TEXT NOT NULL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        groups_json JSONB NOT NULL,
        current_persona_version INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE persona_versions (
        agent_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
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
