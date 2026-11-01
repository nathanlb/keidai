import type { Migration } from "@keidai/postgres";
import { migration001Baseline } from "./001_baseline.js";
import { migration002TaskNextRunAt } from "./002_task_next_run_at.js";
import { migration003TaskScheduleClaim } from "./003_task_schedule_claim.js";
import { migration004RunBudgets } from "./004_run_budgets.js";
import { migration005RunNextPollAt } from "./005_run_next_poll_at.js";
import { migration006ModelAndOpenRouter } from "./006_model_and_openrouter.js";
import { migration007RunAgentOwner } from "./007_run_agent_owner.js";
import { migration008RunAttempts } from "./008_run_attempts.js";
import { migration009AttemptFailureClass } from "./009_attempt_failure_class.js";
import { migration010AttemptModelUsage } from "./010_attempt_model_usage.js";
import { migration011AttemptVerdict } from "./011_attempt_verdict.js";

export const shaidenMigrations: readonly Migration[] = [
  migration001Baseline,
  migration002TaskNextRunAt,
  migration003TaskScheduleClaim,
  migration004RunBudgets,
  migration005RunNextPollAt,
  migration006ModelAndOpenRouter,
  migration007RunAgentOwner,
  migration008RunAttempts,
  migration009AttemptFailureClass,
  migration010AttemptModelUsage,
  migration011AttemptVerdict,
];
