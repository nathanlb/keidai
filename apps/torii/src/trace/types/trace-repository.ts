import type { CallTrace, TraceOutcome } from "@keidai/shared";

export const TRACE_REPOSITORY = Symbol("TRACE_REPOSITORY");

export const DEFAULT_TRACE_RETENTION_COUNT = 200;
export const DEFAULT_TRACE_LIST_LIMIT = 50;
export const MAX_TRACE_LIST_LIMIT = 200;
export const DEFAULT_TRACE_STATS_WINDOW_MS = 15 * 60 * 1000;

export interface TraceListFilters {
  limit: number;
  cursor?: string;
  outcome?: TraceOutcome;
  server?: string;
  text?: string;
}

export interface TraceListResult {
  traces: CallTrace[];
  nextCursor?: string;
}

export interface TraceStatsResult {
  windowMs: number;
  callsPerMinute: number;
  successRate: number;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  deniedCount: number;
  linkingRequiredCount: number;
}

export interface TraceRepository {
  append(trace: CallTrace): void;
  get(traceId: string): CallTrace | null;
  list(filters: TraceListFilters): TraceListResult;
  getStats(windowMs: number): TraceStatsResult;
}
