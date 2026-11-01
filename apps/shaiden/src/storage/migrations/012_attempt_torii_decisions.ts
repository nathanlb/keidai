import type { Migration } from "@keidai/postgres";

/** Counts of Torii denials and linking-required results on the attempt. */
export const migration012AttemptToriiDecisions: Migration = {
  id: "012_attempt_torii_decisions",
  async up(queryable) {
    await queryable.query(`
      ALTER TABLE run_attempts
        ADD COLUMN denial_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN linking_required_count INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE run_attempts
        ADD CONSTRAINT run_attempts_denial_count_check
          CHECK (denial_count >= 0),
        ADD CONSTRAINT run_attempts_linking_required_count_check
          CHECK (linking_required_count >= 0);

      COMMENT ON COLUMN run_attempts.denial_count IS
        'Tool results whose Torii decision was denied. Not shown on stats pages.';
      COMMENT ON COLUMN run_attempts.linking_required_count IS
        'Tool results whose Torii decision was linking-required. Not shown on stats pages.';
    `);
  },
};
