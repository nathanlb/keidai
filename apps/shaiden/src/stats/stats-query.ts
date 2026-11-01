import { toIso, type Queryable } from "@keidai/postgres";
import type { StatsFilters } from "@keidai/shared";
import type { AttemptStatsRow } from "./attempt-stats.js";

export interface StatsQuery {
  taskId?: string;
  agentId?: string;
  ownerId?: string;
  since: string | null;
  kind: StatsFilters["kind"];
  taskRevisionHash: string | null;
  personaVersion: number | null;
}

interface StatsSqlRow {
  run_id: string;
  task_id: string;
  task_revision_hash: string;
  agent_id: string;
  model_id: string | null;
  persona_version: number | null;
  outcome: string;
  outcome_reason: string | null;
  failure_class: string | null;
  max_iterations: number | null;
  timeout_seconds: number | null;
  iterations_used: number;
  active_ms: string | number;
  approval_request_count: number;
  rejection_count: number;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  cost: number | null;
  operator_verdict: "up" | "down" | null;
  tool_counts_json: AttemptStatsRow["toolCounts"] | string;
  started_at: Date | string;
  run_retained: boolean;
}

export async function queryAttemptStats(
  client: Queryable,
  query: StatsQuery,
): Promise<AttemptStatsRow[]> {
  const result = await client.query<StatsSqlRow>(
    `
      SELECT
        a.run_id, a.task_id, a.task_revision_hash, a.agent_id, a.model_id,
        a.persona_version,
        a.outcome, a.outcome_reason, a.failure_class,
        a.max_iterations, a.timeout_seconds, a.iterations_used, a.active_ms,
        a.approval_request_count, a.rejection_count,
        a.input_tokens, a.output_tokens, a.cost, a.operator_verdict,
        a.tool_counts_json, a.started_at,
        (r.id IS NOT NULL) AS run_retained
      FROM run_attempts a
      LEFT JOIN runs r ON r.id = a.run_id
      WHERE ($1::text IS NULL OR a.task_id = $1)
        AND ($2::text IS NULL OR a.agent_id = $2)
        AND ($3::text IS NULL OR a.agent_owner_id = $3)
        AND ($4::timestamptz IS NULL OR a.started_at >= $4)
        AND ($5::text = 'all' OR a.kind = $5)
        AND ($6::text IS NULL OR a.task_revision_hash = $6)
        AND ($7::int IS NULL OR a.persona_version IS NOT DISTINCT FROM $7)
      ORDER BY a.started_at ASC
    `,
    [
      query.taskId ?? null,
      query.agentId ?? null,
      query.ownerId ?? null,
      query.since,
      query.kind,
      query.taskRevisionHash,
      query.personaVersion,
    ],
  );
  return result.rows.map(toAttemptRow);
}

export async function attemptOwners(
  client: Queryable,
  subject: { taskId?: string; agentId?: string },
): Promise<Array<string | null>> {
  const result = await client.query<{ agent_owner_id: string | null }>(
    `
      SELECT DISTINCT agent_owner_id
      FROM run_attempts
      WHERE ($1::text IS NULL OR task_id = $1)
        AND ($2::text IS NULL OR agent_id = $2)
    `,
    [subject.taskId ?? null, subject.agentId ?? null],
  );
  return result.rows.map((row) => row.agent_owner_id);
}

export async function currentPersonaVersion(
  client: Queryable,
  agentId: string,
): Promise<number | null> {
  const result = await client.query<{ persona_version: number | null }>(
    `
      SELECT MAX(persona_version) AS persona_version
      FROM run_attempts
      WHERE agent_id = $1
    `,
    [agentId],
  );
  return result.rows[0]?.persona_version ?? null;
}

function toAttemptRow(row: StatsSqlRow): AttemptStatsRow {
  const tools =
    typeof row.tool_counts_json === "string"
      ? (JSON.parse(row.tool_counts_json) as AttemptStatsRow["toolCounts"])
      : row.tool_counts_json;
  return {
    runId: row.run_id,
    taskId: row.task_id,
    taskRevisionHash: row.task_revision_hash,
    agentId: row.agent_id,
    modelId: row.model_id,
    personaVersion: row.persona_version,
    outcome: row.outcome,
    outcomeReason: row.outcome_reason,
    failureClass: row.failure_class,
    maxIterations: row.max_iterations,
    timeoutSeconds: row.timeout_seconds,
    iterationsUsed: Number(row.iterations_used),
    activeMs: Number(row.active_ms),
    approvalRequestCount: Number(row.approval_request_count),
    rejectionCount: Number(row.rejection_count),
    inputTokens: row.input_tokens === null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
    cost: row.cost,
    verdict: row.operator_verdict,
    toolCounts: tools ?? {},
    startedAt: toIso(row.started_at),
    retained: row.run_retained,
  };
}
