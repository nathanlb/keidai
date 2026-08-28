import type { Migration } from "@keidai/postgres";
import { migration001Baseline } from "./001_baseline.js";
import { migration002GroupPolicies } from "./002_group_policies.js";
import { migration003Connectors } from "./003_connectors.js";

export const toriiMigrations: readonly Migration[] = [
  migration001Baseline,
  migration002GroupPolicies,
  migration003Connectors,
];
