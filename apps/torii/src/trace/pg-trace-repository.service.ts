import {
  defaultPartitionRetentionMs,
  dropWeeklyPartitionsOlderThan,
  ensureWeeklyPartitions,
  toIso,
  type Pool,
} from "@keidai/postgres";
import {
  PolicyDecision,
  type CallTrace,
  type TraceOutcome,
} from "@keidai/shared";
import type {
  TraceListFilters,
  TraceListResult,
  TraceRepository,
  TraceStatsResult,
} from "./types/trace-repository.js";
import { deriveTraceOutcome } from "./utils/derive-trace-outcome.js";

interface TraceRow {
  trace_id: string;
  timestamp: Date | string;
  server: string;
  tool: string;
  agent_id: string | null;
  owner_id: string | null;
  credential_ref: string | null;
  policy_decision: string;
  duration_ms: number | null;
  error: string | null;
  run_id: string | null;
  step_id: string | null;
  task_id: string | null;
  backend_task_id: string | null;
}

const TRACE_SELECT = `
  trace_id,
  timestamp,
  server,
  tool,
  agent_id,
  owner_id,
  credential_ref,
  policy_decision,
  duration_ms,
  error,
  run_id,
  step_id,
  task_id,
  backend_task_id
`;

function rowToTrace(row: TraceRow): CallTrace {
  return {
    traceId: row.trace_id,
    timestamp: toIso(row.timestamp),
    server: row.server,
    tool: row.tool,
    ...(row.agent_id && row.owner_id
      ? { principal: { agentId: row.agent_id, ownerId: row.owner_id } }
      : {}),
    ...(row.credential_ref ? { credentialRef: row.credential_ref } : {}),
    policyDecision: row.policy_decision as PolicyDecision,
    ...(row.duration_ms !== null ? { durationMs: row.duration_ms } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.run_id ? { runId: row.run_id } : {}),
    ...(row.step_id ? { stepId: row.step_id } : {}),
    ...(row.task_id ? { taskId: row.task_id } : {}),
    ...(row.backend_task_id ? { backendTaskId: row.backend_task_id } : {}),
  };
}

function outcomeSqlCondition(outcome: TraceOutcome): string {
  switch (outcome) {
    case "denied":
      return "policy_decision = 'denied'";
    case "linking_required":
      return "policy_decision = 'allowed' AND error LIKE 'OAuth connection required%'";
    case "error":
      return "policy_decision = 'allowed' AND error IS NOT NULL AND error NOT LIKE 'OAuth connection required%'";
    case "success":
      return "policy_decision = 'allowed' AND error IS NULL";
  }
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? null;
}

export class PgTraceRepository implements TraceRepository {
  constructor(private readonly pool: Pool) {}

  async append(trace: CallTrace): Promise<void> {
    const at = new Date(trace.timestamp);
    await ensureWeeklyPartitions(this.pool, "call_traces", at, 0);
    await this.pool.query(
      `
        INSERT INTO call_traces (
          trace_id,
          timestamp,
          server,
          tool,
          agent_id,
          owner_id,
          credential_ref,
          policy_decision,
          duration_ms,
          error,
          run_id,
          step_id,
          task_id,
          backend_task_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        trace.traceId,
        toIso(at),
        trace.server,
        trace.tool,
        trace.principal?.agentId ?? null,
        trace.principal?.ownerId ?? null,
        trace.credentialRef ?? null,
        trace.policyDecision,
        trace.durationMs ?? null,
        trace.error ?? null,
        trace.runId ?? null,
        trace.stepId ?? null,
        trace.taskId ?? null,
        trace.backendTaskId ?? null,
      ],
    );
    await dropWeeklyPartitionsOlderThan(
      this.pool,
      "call_traces",
      new Date(Date.now() - defaultPartitionRetentionMs()),
    );
  }

  async get(traceId: string): Promise<CallTrace | null> {
    const result = await this.pool.query<TraceRow>(
      `
        SELECT ${TRACE_SELECT}
        FROM call_traces
        WHERE trace_id = $1
      `,
      [traceId],
    );
    const row = result.rows[0];
    return row ? rowToTrace(row) : null;
  }

  async list(filters: TraceListFilters): Promise<TraceListResult> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters.cursor) {
      const cursor = await this.get(filters.cursor);
      if (cursor) {
        conditions.push(
          "(timestamp < $1::timestamptz OR (timestamp = $1::timestamptz AND trace_id < $2))",
        );
        params.push(cursor.timestamp, cursor.traceId);
      }
    }

    if (filters.server) {
      params.push(filters.server);
      conditions.push(`server = $${params.length}`);
    }

    if (filters.outcome) {
      conditions.push(outcomeSqlCondition(filters.outcome));
    }

    if (filters.text) {
      const pattern = `%${filters.text}%`;
      params.push(pattern, pattern, pattern, pattern);
      const start = params.length - 3;
      conditions.push(
        `(tool ILIKE $${start} OR server ILIKE $${start + 1} OR agent_id ILIKE $${start + 2} OR owner_id ILIKE $${start + 3})`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(filters.limit + 1);
    const result = await this.pool.query<TraceRow>(
      `
        SELECT ${TRACE_SELECT}
        FROM call_traces
        ${whereClause}
        ORDER BY timestamp DESC, trace_id DESC
        LIMIT $${params.length}
      `,
      params,
    );

    const hasMore = result.rows.length > filters.limit;
    const pageRows = hasMore
      ? result.rows.slice(0, filters.limit)
      : result.rows;
    const traces = pageRows.map(rowToTrace);

    return {
      traces,
      ...(hasMore
        ? { nextCursor: pageRows[pageRows.length - 1]!.trace_id }
        : {}),
    };
  }

  async getStats(windowMs: number): Promise<TraceStatsResult> {
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const result = await this.pool.query<TraceRow>(
      `
        SELECT ${TRACE_SELECT}
        FROM call_traces
        WHERE timestamp >= $1::timestamptz
        ORDER BY timestamp ASC
      `,
      [cutoff],
    );
    const traces = result.rows.map(rowToTrace);
    const outcomes = traces.map(deriveTraceOutcome);
    const successCount = outcomes.filter(
      (outcome) => outcome === "success",
    ).length;
    const deniedCount = outcomes.filter(
      (outcome) => outcome === "denied",
    ).length;
    const linkingRequiredCount = outcomes.filter(
      (outcome) => outcome === "linking_required",
    ).length;
    const durations = traces
      .map((trace) => trace.durationMs)
      .filter((duration): duration is number => duration !== undefined);

    return {
      windowMs,
      callsPerMinute:
        windowMs > 0 ? (traces.length / windowMs) * 60_000 : 0,
      successRate: traces.length > 0 ? successCount / traces.length : 0,
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      deniedCount,
      linkingRequiredCount,
    };
  }
}
