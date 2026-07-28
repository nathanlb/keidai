import type { Migration } from "../migrate.js";

/**
 * Baseline marker. Domain tables (agents, persona versions, bearers, grants)
 * land in later migrations (NAT-115).
 */
export const migration001Baseline: Migration = {
  id: "001_baseline",
  up() {
    // Intentionally empty: establishes the migration ledger only.
  },
};
