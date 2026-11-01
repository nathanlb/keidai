import { randomUUID } from "node:crypto";
import { toIso, type Queryable } from "@keidai/postgres";
import {
  taskSchema,
  type RunStep,
  type RunStepKind,
  type Task,
} from "@keidai/shared";
import {
  buildAttemptFact,
  type AttemptFact,
  type AttemptKind,
  type AttemptRunSource,
  type PriorAttempt,
} from "./attempt-fact.js";

interface LockedRunRow {
  id: string;
  task_id: string;
  task_snapshot_json: unknown;
  started_at: Date | string;
  assignee: string;
  persona_version: number | null;
  model_id: string | null;
  agent_owner_id: string | null;
  iterations_used: number;
  active_elapsed_ms: string | number;
}

interface StepRow {
  id: string;
  timestamp: Date | string;
  kind: string;
  payload_json: unknown;
}

interface PriorAttemptRow {
  attempt_index: number;
  kind: AttemptKind;
  iterations_used: number;
  active_ms: string | number;
}

function asJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function asCount(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

function stepFromRow(row: StepRow): RunStep {
  const payload = asJson<Record<string, unknown>>(
    (row.payload_json ?? {}) as Record<string, unknown> | string,
  );
  return {
    id: row.id,
    timestamp: toIso(row.timestamp),
    kind: row.kind as RunStepKind,
    ...payload,
  } as RunStep;
}

function parseTaskSnapshot(value: unknown): Task {
  return taskSchema.parse(
    typeof value === "string" ? JSON.parse(value) : value,
  );
}

export interface AttemptSource {
  run: AttemptRunSource;
  steps: RunStep[];
  previousAttempts: PriorAttempt[];
  budget: { iterationsUsed: number; activeElapsedMs: number };
}

/**
 * Lock the run, then read the log and any attempt rows already stored.
 * Step payloads drop their preview text; only the counted fields are kept.
 */
export async function loadAttemptSource(
  client: Queryable,
  runId: string,
): Promise<AttemptSource | null> {
  const runResult = await client.query<LockedRunRow>(
    `
      SELECT id, task_id, task_snapshot_json, started_at, assignee,
             persona_version, model_id, agent_owner_id,
             iterations_used, active_elapsed_ms
      FROM runs
      WHERE id = $1
      FOR UPDATE
    `,
    [runId],
  );
  const row = runResult.rows[0];
  if (!row) {
    return null;
  }

  const stepResult = await client.query<StepRow>(
    `
      SELECT id, timestamp, kind,
             payload_json - 'text' - 'inputPreview' - 'outputPreview'
               AS payload_json
      FROM run_steps
      WHERE run_id = $1
      ORDER BY timestamp ASC, id ASC
    `,
    [runId],
  );
  const priorResult = await client.query<PriorAttemptRow>(
    `
      SELECT attempt_index, kind, iterations_used, active_ms
      FROM run_attempts
      WHERE run_id = $1
      ORDER BY attempt_index ASC
    `,
    [runId],
  );

  return {
    run: {
      id: row.id,
      taskId: row.task_id,
      task: parseTaskSnapshot(row.task_snapshot_json),
      assignee: row.assignee,
      startedAt: toIso(row.started_at),
      modelId: row.model_id,
      personaVersion: row.persona_version,
      agentOwnerId: row.agent_owner_id,
    },
    steps: stepResult.rows.map(stepFromRow),
    previousAttempts: priorResult.rows.map((prior) => ({
      attemptIndex: prior.attempt_index,
      kind: prior.kind,
      iterationsUsed: asCount(prior.iterations_used),
      activeMs: asCount(prior.active_ms),
    })),
    budget: {
      iterationsUsed: asCount(row.iterations_used),
      activeElapsedMs: asCount(row.active_elapsed_ms),
    },
  };
}

export async function insertRunAttempt(
  client: Queryable,
  fact: AttemptFact,
): Promise<void> {
  await client.query(
    `
      INSERT INTO run_attempts (
        id, run_id, attempt_index, kind,
        task_id, agent_id, agent_owner_id,
        model_id, persona_version, task_revision_hash,
        max_iterations, timeout_seconds,
        started_at, ended_at, active_ms, iterations_used,
        outcome, outcome_reason, failure_class,
        tool_counts_json, approval_request_count, rejection_count,
        backfilled
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19,
        $20::jsonb, $21, $22,
        $23
      )
    `,
    [
      randomUUID(),
      fact.runId,
      fact.attemptIndex,
      fact.kind,
      fact.taskId,
      fact.agentId,
      fact.agentOwnerId,
      fact.modelId,
      fact.personaVersion,
      fact.taskRevisionHash,
      fact.maxIterations,
      fact.timeoutSeconds,
      fact.startedAt,
      fact.endedAt,
      fact.activeMs,
      fact.iterationsUsed,
      fact.outcome,
      fact.outcomeReason,
      fact.failureClass,
      JSON.stringify(fact.toolCounts),
      fact.approvalRequestCount,
      fact.rejectionCount,
      fact.backfilled,
    ],
  );
}

/**
 * Write the attempt row for an outcome step that was just inserted on
 * `client`. The run budget has not yet been reset by a follow-up.
 */
export async function recordRunAttempt(
  client: Queryable,
  runId: string,
  outcomeStepId: string,
): Promise<void> {
  const source = await loadAttemptSource(client, runId);
  if (!source) {
    return;
  }
  const fact = buildAttemptFact({
    run: source.run,
    steps: source.steps,
    outcomeStepId,
    previousAttempts: source.previousAttempts,
    liveBudget: source.budget,
  });
  await insertRunAttempt(client, fact);
}
