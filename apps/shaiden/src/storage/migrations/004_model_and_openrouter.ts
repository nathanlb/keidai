import type { Migration } from "@keidai/postgres";

/**
 * Task-level model override, the model stamped on a run, and the sealed
 * OpenRouter API key set from the operator UI.
 */
export const migration004ModelAndOpenRouter: Migration = {
  id: "004_model_and_openrouter",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS model_id TEXT;

      ALTER TABLE runs
        ADD COLUMN IF NOT EXISTS model_id TEXT;

      CREATE TABLE IF NOT EXISTS openrouter_credential (
        id TEXT NOT NULL PRIMARY KEY,
        sealed_payload TEXT NOT NULL,
        hint TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);
  },
};
