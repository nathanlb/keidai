import { toIso, type Queryable } from "@keidai/postgres";
import type { AttemptVerdict, RunAttemptSummary } from "@keidai/shared";

interface AttemptRow {
  attempt_index: number;
  outcome: string;
  outcome_reason: string | null;
  ended_at: Date | string;
  operator_verdict: AttemptVerdict | null;
  operator_verdict_note: string | null;
  operator_verdict_by: string | null;
  operator_verdict_at: Date | string | null;
}

function toSummary(row: AttemptRow): RunAttemptSummary {
  return {
    attemptIndex: row.attempt_index,
    outcome: row.outcome,
    outcomeReason: row.outcome_reason,
    endedAt: toIso(row.ended_at),
    verdict: row.operator_verdict,
    note: row.operator_verdict_note,
    operatorId: row.operator_verdict_by,
    verdictAt: row.operator_verdict_at ? toIso(row.operator_verdict_at) : null,
  };
}

const ATTEMPT_COLUMNS = `
  attempt_index, outcome, outcome_reason, ended_at,
  operator_verdict, operator_verdict_note, operator_verdict_by,
  operator_verdict_at
`;

export async function listRunAttempts(
  client: Queryable,
  runId: string,
): Promise<RunAttemptSummary[]> {
  const result = await client.query<AttemptRow>(
    `
      SELECT ${ATTEMPT_COLUMNS}
      FROM run_attempts
      WHERE run_id = $1
      ORDER BY attempt_index ASC
    `,
    [runId],
  );
  return result.rows.map(toSummary);
}

/** Owner stamped on the attempt. Undefined when the run has no attempt rows. */
export async function attemptOwnerId(
  client: Queryable,
  runId: string,
): Promise<string | null | undefined> {
  const result = await client.query<{ agent_owner_id: string | null }>(
    `
      SELECT agent_owner_id
      FROM run_attempts
      WHERE run_id = $1
      LIMIT 1
    `,
    [runId],
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }
  return row.agent_owner_id;
}

export async function setAttemptVerdict(
  client: Queryable,
  input: {
    runId: string;
    attemptIndex: number;
    verdict: AttemptVerdict;
    note: string | null;
    operatorId: string;
    verdictAt: string;
  },
): Promise<RunAttemptSummary | null> {
  const result = await client.query<AttemptRow>(
    `
      UPDATE run_attempts
      SET operator_verdict = $3,
          operator_verdict_note = $4,
          operator_verdict_by = $5,
          operator_verdict_at = $6
      WHERE run_id = $1 AND attempt_index = $2
      RETURNING ${ATTEMPT_COLUMNS}
    `,
    [
      input.runId,
      input.attemptIndex,
      input.verdict,
      input.note,
      input.operatorId,
      input.verdictAt,
    ],
  );
  const row = result.rows[0];
  return row ? toSummary(row) : null;
}

export async function clearAttemptVerdict(
  client: Queryable,
  runId: string,
  attemptIndex: number,
): Promise<RunAttemptSummary | null> {
  const result = await client.query<AttemptRow>(
    `
      UPDATE run_attempts
      SET operator_verdict = NULL,
          operator_verdict_note = NULL,
          operator_verdict_by = NULL,
          operator_verdict_at = NULL
      WHERE run_id = $1 AND attempt_index = $2
      RETURNING ${ATTEMPT_COLUMNS}
    `,
    [runId, attemptIndex],
  );
  const row = result.rows[0];
  return row ? toSummary(row) : null;
}
