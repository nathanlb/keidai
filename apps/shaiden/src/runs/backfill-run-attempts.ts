import { withTransaction, type Pool } from "@keidai/postgres";
import { buildAttemptFact, type PriorAttempt } from "./attempt-fact.js";
import { insertRunAttempt, loadAttemptSource } from "./record-run-attempt.js";

export interface BackfillRunAttemptsResult {
  runs: number;
  attempts: number;
}

/**
 * Fill attempt rows for outcome steps that have none, including earlier
 * outcomes of runs that gained a live row after the table was added.
 * Safe to re-run: outcomes that already have a row are left alone.
 * Iterations and active time are derived from steps and marked backfilled.
 */
export async function backfillRunAttempts(
  pool: Pool,
): Promise<BackfillRunAttemptsResult> {
  const candidates = await pool.query<{ run_id: string }>(
    `
      SELECT s.run_id
      FROM run_steps s
      WHERE s.kind = 'outcome'
      GROUP BY s.run_id
      HAVING COUNT(*) > (
        SELECT COUNT(*) FROM run_attempts a WHERE a.run_id = s.run_id
      )
      ORDER BY s.run_id
    `,
  );

  let runs = 0;
  let attempts = 0;
  for (const candidate of candidates.rows) {
    const inserted = await withTransaction(pool, async (client) => {
      const source = await loadAttemptSource(client, candidate.run_id);
      if (!source) {
        return 0;
      }

      const stored = new Map(
        source.previousAttempts.map((attempt) => [
          attempt.attemptIndex,
          attempt,
        ]),
      );
      const outcomes = source.steps.filter((step) => step.kind === "outcome");
      let prior: PriorAttempt[] = [];
      let count = 0;
      for (const [position, outcome] of outcomes.entries()) {
        const existing = stored.get(position + 1);
        if (existing) {
          prior = [...prior, existing];
          continue;
        }
        const fact = buildAttemptFact({
          run: source.run,
          steps: source.steps,
          outcomeStepId: outcome.id,
          previousAttempts: prior,
        });
        await insertRunAttempt(client, fact);
        prior = [
          ...prior,
          {
            attemptIndex: fact.attemptIndex,
            kind: fact.kind,
            iterationsUsed: fact.iterationsUsed,
            activeMs: fact.activeMs,
          },
        ];
        count += 1;
      }
      return count;
    });
    if (inserted > 0) {
      runs += 1;
      attempts += inserted;
    }
  }

  return { runs, attempts };
}
