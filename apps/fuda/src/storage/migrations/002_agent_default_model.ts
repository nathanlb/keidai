import type { Migration } from "@keidai/postgres";

/** Optional OpenRouter model id used when a task does not override it. */
export const migration002AgentDefaultModel: Migration = {
  id: "002_agent_default_model",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE agents
        ADD COLUMN IF NOT EXISTS default_model_id TEXT;
    `);
  },
};
