import type { Migration } from "@keidai/postgres";

/** Tokens, cost, and resolved model summed onto the attempt from its model steps. */
export const migration010AttemptModelUsage: Migration = {
  id: "010_attempt_model_usage",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE run_attempts
        ADD COLUMN input_tokens BIGINT,
        ADD COLUMN output_tokens BIGINT,
        ADD COLUMN cost DOUBLE PRECISION,
        ADD COLUMN resolved_model_id TEXT,
        ADD COLUMN resolved_model_changed BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE run_attempts
        ADD CONSTRAINT run_attempts_token_counts_check
        CHECK (
          (input_tokens IS NULL OR input_tokens >= 0)
          AND (output_tokens IS NULL OR output_tokens >= 0)
        );

      COMMENT ON COLUMN run_attempts.cost IS
        'Sum of OpenRouter usage.cost (USD) for model steps that reported one. Null when none did.';
      COMMENT ON COLUMN run_attempts.resolved_model_id IS
        'Concrete model id from the last model step. Null when no step recorded one, including ~ aliases that never resolved.';
      COMMENT ON COLUMN run_attempts.resolved_model_changed IS
        'True when model steps in the attempt resolved to more than one concrete id.';
    `);
  },
};
