import type { CallTrace } from "../call-trace.js";

/** Derived outcome for activity feed filters and summary tiles. */
export type TraceOutcome =
  | "success"
  | "error"
  | "denied"
  | "linking_required";

/** Call trace with a derived outcome for API consumers. */
export interface TraceListItem extends CallTrace {
  outcome: TraceOutcome;
}

/** Query parameters for `GET /api/traces`. */
export interface TraceListQuery {
  /** Page size; defaults to 50, capped at 200. */
  limit?: number;
  /** Opaque cursor (`traceId`) for the next older page. */
  cursor?: string;
  outcome?: TraceOutcome;
  server?: string;
  /** Free-text match across tool, server, agent, and owner. */
  q?: string;
}

/** Response body for `GET /api/traces`. */
export interface TracesResponse {
  traces: TraceListItem[];
  /** Present when more older traces are available. */
  nextCursor?: string;
}

/** Response body for `GET /api/traces/stats`. */
export interface TraceStatsResponse {
  /** Window used for aggregation, in milliseconds. */
  windowMs: number;
  callsPerMinute: number;
  /** Fraction of traces with outcome `success` in the window (0–1). */
  successRate: number;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  deniedCount: number;
  linkingRequiredCount: number;
}

/** SSE `event:` names on `GET /api/traces/events`. */
export const TRACE_SSE_EVENT = {
  traceCreated: "trace_created",
} as const;

export type TraceSseEventType =
  (typeof TRACE_SSE_EVENT)[keyof typeof TRACE_SSE_EVENT];

/**
 * Parsed SSE event from the traces event stream.
 * The `event:` line is `type`; the `data:` line is JSON for `trace`.
 */
export type TraceSseEvent = {
  type: typeof TRACE_SSE_EVENT.traceCreated;
  trace: TraceListItem;
};

/** Wire-format `data:` payload keyed by SSE event name. */
export interface TraceSseEventData {
  [TRACE_SSE_EVENT.traceCreated]: TraceListItem;
}
