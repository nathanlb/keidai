import type { CallTrace } from "@keidai/shared";
import { injectable } from "tsyringe";
import type {
  TraceListFilters,
  TraceListResult,
  TraceRepository,
  TraceStatsResult,
} from "./types/trace-repository.js";
import { DEFAULT_TRACE_RETENTION_COUNT } from "./types/trace-repository.js";
import { deriveTraceOutcome } from "./utils/derive-trace-outcome.js";

function compareTraces(left: CallTrace, right: CallTrace): number {
  const timestampCompare = right.timestamp.localeCompare(left.timestamp);
  if (timestampCompare !== 0) {
    return timestampCompare;
  }
  return right.traceId.localeCompare(left.traceId);
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
export class InMemoryTraceRepository implements TraceRepository {
  private readonly traces: CallTrace[] = [];

  constructor(
    private readonly retentionCount = DEFAULT_TRACE_RETENTION_COUNT,
  ) {}

  append(trace: CallTrace): void {
    this.traces.push(trace);
    this.traces.sort(compareTraces);
    if (this.traces.length > this.retentionCount) {
      this.traces.length = this.retentionCount;
    }
  }

  get(traceId: string): CallTrace | null {
    return this.traces.find((trace) => trace.traceId === traceId) ?? null;
  }

  list(filters: TraceListFilters): TraceListResult {
    let filtered = [...this.traces];

    if (filters.cursor) {
      const cursor = this.get(filters.cursor);
      if (cursor) {
        filtered = filtered.filter(
          (trace) =>
            trace.timestamp < cursor.timestamp ||
            (trace.timestamp === cursor.timestamp &&
              trace.traceId < cursor.traceId),
        );
      }
    }

    if (filters.server) {
      filtered = filtered.filter((trace) => trace.server === filters.server);
    }

    if (filters.outcome) {
      filtered = filtered.filter(
        (trace) => deriveTraceOutcome(trace) === filters.outcome,
      );
    }

    if (filters.text) {
      const needle = filters.text.toLowerCase();
      filtered = filtered.filter((trace) =>
        [trace.tool, trace.server, trace.principal?.agentId, trace.principal?.ownerId]
          .filter((value): value is string => value !== undefined)
          .some((value) => value.toLowerCase().includes(needle)),
      );
    }

    const page = filtered.slice(0, filters.limit);
    const hasMore = filtered.length > filters.limit;

    return {
      traces: page,
      ...(hasMore ? { nextCursor: page[page.length - 1]!.traceId } : {}),
    };
  }

  getStats(windowMs: number): TraceStatsResult {
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const traces = this.traces.filter((trace) => trace.timestamp >= cutoff);
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
