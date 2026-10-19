import type { Migration } from "@keidai/postgres";

/**
 * Human owner of the agent a run executes as.
 * `runs.owner_id` remains the worker-lease replica id.
 */
export const migration007RunAgentOwner: Migration = {
  id: "007_run_agent_owner",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE runs
        ADD COLUMN IF NOT EXISTS agent_owner_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_runs_agent_owner_id
        ON runs(agent_owner_id);
    `);
  },
};
