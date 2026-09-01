import type { Migration } from "@keidai/postgres";
import { migration001Baseline } from "./001_baseline.js";
import { migration002TaskNextRunAt } from "./002_task_next_run_at.js";
import { migration003TaskScheduleClaim } from "./003_task_schedule_claim.js";

export const shaidenMigrations: readonly Migration[] = [
  migration001Baseline,
  migration002TaskNextRunAt,
  migration003TaskScheduleClaim,
];
