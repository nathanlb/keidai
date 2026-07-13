import type { DatabaseSync } from "node:sqlite";
import {
  PolicyDecision,
  type CallTrace,
  type TraceOutcome,
} from "@keidai/shared";
import { injectable } from "tsyringe";
import type {
  TraceListFilters,
  TraceListResult,
  TraceRepository,
  TraceStatsResult,
} from "./types/trace-repository.js";
import { DEFAULT_TRACE_RETENTION_COUNT } from "./types/trace-repository.js";
import { deriveTraceOutcome } from "./utils/derive-trace-outcome.js";

interface TraceRow {
  trace_id: string;
  timestamp: string;
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
}

function rowToTrace(row: TraceRow): CallTrace {
  return {
    traceId: row.trace_id,
    timestamp: row.timestamp,
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
  };
}

function traceToRow(trace: CallTrace): TraceRow {
  return {
    trace_id: trace.traceId,
    timestamp: trace.timestamp,
    server: trace.server,
    tool: trace.tool,
    agent_id: trace.principal?.agentId ?? null,
    owner_id: trace.principal?.ownerId ?? null,
    credential_ref: trace.credentialRef ?? null,
    policy_decision: trace.policyDecision,
    duration_ms: trace.durationMs ?? null,
    error: trace.error ?? null,
    run_id: trace.runId ?? null,
    step_id: trace.stepId ?? null,
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

@injectable()
export class SqliteTraceRepository implements TraceRepository {
  private readonly insertStatement;
  private readonly getStatement;
  private readonly trimStatement;

  constructor(
    private readonly db: DatabaseSync,
    private readonly retentionCount = DEFAULT_TRACE_RETENTION_COUNT,
  ) {
    this.insertStatement = db.prepare(`
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
        step_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.getStatement = db.prepare(`
      SELECT
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
        step_id
      FROM call_traces
      WHERE trace_id = ?
    `);
    this.trimStatement = db.prepare(`
      DELETE FROM call_traces
      WHERE trace_id NOT IN (
        SELECT trace_id
        FROM call_traces
        ORDER BY timestamp DESC, trace_id DESC
        LIMIT ?
      )
    `);
  }

  append(trace: CallTrace): void {
    const row = traceToRow(trace);
    this.insertStatement.run(
      row.trace_id,
      row.timestamp,
      row.server,
      row.tool,
      row.agent_id,
      row.owner_id,
      row.credential_ref,
      row.policy_decision,
      row.duration_ms,
      row.error,
      row.run_id,
      row.step_id,
    );
    this.trimStatement.run(this.retentionCount);
  }

  get(traceId: string): CallTrace | null {
    const row = this.getStatement.get(traceId) as TraceRow | undefined;
    return row ? rowToTrace(row) : null;
  }

  list(filters: TraceListFilters): TraceListResult {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters.cursor) {
      const cursorRow = this.getStatement.get(filters.cursor) as
        | TraceRow
        | undefined;
      if (cursorRow) {
        conditions.push(
          "(timestamp < ? OR (timestamp = ? AND trace_id < ?))",
        );
        params.push(
          cursorRow.timestamp,
          cursorRow.timestamp,
          cursorRow.trace_id,
        );
      }
    }

    if (filters.server) {
      conditions.push("server = ?");
      params.push(filters.server);
    }

    if (filters.outcome) {
      conditions.push(outcomeSqlCondition(filters.outcome));
    }

    if (filters.text) {
      const pattern = `%${filters.text}%`;
      conditions.push(
        "(tool LIKE ? OR server LIKE ? OR agent_id LIKE ? OR owner_id LIKE ?)",
      );
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const statement = this.db.prepare(`
      SELECT
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
        step_id
      FROM call_traces
      ${whereClause}
      ORDER BY timestamp DESC, trace_id DESC
      LIMIT ?
    `);

    const rows = statement.all(...params, filters.limit + 1) as unknown as TraceRow[];
    const hasMore = rows.length > filters.limit;
    const pageRows = hasMore ? rows.slice(0, filters.limit) : rows;
    const traces = pageRows.map(rowToTrace);

    return {
      traces,
      ...(hasMore
        ? { nextCursor: pageRows[pageRows.length - 1]!.trace_id }
        : {}),
    };
  }

  getStats(windowMs: number): TraceStatsResult {
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const statement = this.db.prepare(`
      SELECT
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
        step_id
      FROM call_traces
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `);
    const rows = statement.all(cutoff) as unknown as TraceRow[];
    const traces = rows.map(rowToTrace);
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
