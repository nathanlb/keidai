import type { Migration } from "../migrate.js";

/**
 * Baseline marker. Establishes the migration ledger only.
 * Domain tables land in `002_agent_schema`.
 */
export const migration001Baseline: Migration = {
  id: "001_baseline",
  up() {
    // Intentionally empty: establishes the migration ledger only.
  },
};
