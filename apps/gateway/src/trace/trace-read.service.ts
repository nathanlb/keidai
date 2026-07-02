import {
  TRACE_SSE_EVENT,
  type TraceListQuery,
  type TraceSseEvent,
  type TraceStatsResponse,
  type TracesResponse,
} from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { TraceEmitterService } from "./trace-emitter.service.js";
import { TRACE_REPOSITORY } from "./types/trace-repository.js";
import type { TraceRepository } from "./types/trace-repository.js";
import type { TraceEmitter } from "./types/trace-emitter.js";
import {
  DEFAULT_TRACE_LIST_LIMIT,
  DEFAULT_TRACE_STATS_WINDOW_MS,
  MAX_TRACE_LIST_LIMIT,
} from "./types/trace-repository.js";
import { projectTraceItem } from "./utils/project-trace-api.js";

/** Read-only projections of persisted call traces for UI consumption. */
@injectable()
export class TraceReadService {
  constructor(
    @inject(TRACE_REPOSITORY)
    private readonly repository: TraceRepository,
    @inject(TraceEmitterService)
    private readonly traceEmitter: TraceEmitter,
  ) {}

  listTraces(query: TraceListQuery = {}): TracesResponse {
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_TRACE_LIST_LIMIT),
      MAX_TRACE_LIST_LIMIT,
    );
    const result = this.repository.list({
      limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.server ? { server: query.server } : {}),
      ...(query.q ? { text: query.q } : {}),
    });

    return {
      traces: result.traces.map(projectTraceItem),
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    };
  }

  getTrace(traceId: string) {
    const trace = this.repository.get(traceId);
    return trace ? projectTraceItem(trace) : null;
  }

  getStats(windowMs = DEFAULT_TRACE_STATS_WINDOW_MS): TraceStatsResponse {
    return this.repository.getStats(windowMs);
  }

  subscribe(listener: (event: TraceSseEvent) => void): () => void {
    return this.traceEmitter.subscribe((trace) => {
      listener({
        type: TRACE_SSE_EVENT.traceCreated,
        trace: projectTraceItem(trace),
      });
    });
  }
}
