import type { Migration } from "@keidai/postgres";

/** Optional single emoji that represents the agent in operator surfaces. */
export const migration003AgentEmoji: Migration = {
  id: "003_agent_emoji",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE agents
        ADD COLUMN IF NOT EXISTS emoji TEXT;
    `);
  },
};
