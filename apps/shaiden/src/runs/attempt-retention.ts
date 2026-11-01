import type { Queryable } from "@keidai/postgres";

/** Attempt rows are kept for a year unless the deployment overrides it. */
export const DEFAULT_ATTEMPT_RETENTION_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Age of `run_attempts` rows. Independent of `KEIDAI_PARTITION_RETENTION_DAYS`.
 * Override with `SHAIDEN_ATTEMPT_RETENTION_DAYS`.
 */
export function attemptRetentionMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.SHAIDEN_ATTEMPT_RETENTION_DAYS?.trim();
  if (!raw) {
    return DEFAULT_ATTEMPT_RETENTION_DAYS * DAY_MS;
  }
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("SHAIDEN_ATTEMPT_RETENTION_DAYS must be a positive number");
  }
  return days * DAY_MS;
}

export async function deleteExpiredRunAttempts(
  queryable: Queryable,
  cutoff: Date,
): Promise<number> {
  const result = await queryable.query(
    `DELETE FROM run_attempts WHERE ended_at < $1`,
    [cutoff.toISOString()],
  );
  return result.rowCount ?? 0;
}
