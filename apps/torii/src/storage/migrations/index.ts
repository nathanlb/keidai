import type { Migration } from "@keidai/postgres";
import { migration001Baseline } from "./001_baseline.js";
import { migration002GroupPolicies } from "./002_group_policies.js";

export const toriiMigrations: readonly Migration[] = [
  migration001Baseline,
  migration002GroupPolicies,
];
