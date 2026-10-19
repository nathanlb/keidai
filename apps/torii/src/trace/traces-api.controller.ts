import {
  TRACE_SSE_EVENT,
  type TraceListQuery,
  type TraceOutcome,
  type TraceSseEvent,
} from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { requestOperator } from "../http/utils/operator-access.js";
import { TraceReadService } from "./trace-read.service.js";
import { openSseStream } from "../http/utils/sse-stream.js";
import {
  DEFAULT_TRACE_LIST_LIMIT,
  DEFAULT_TRACE_STATS_WINDOW_MS,
  MAX_TRACE_LIST_LIMIT,
} from "./types/trace-repository.js";

const TRACE_OUTCOMES = new Set<TraceOutcome>([
  "success",
  "error",
  "denied",
  "linking_required",
]);

function parseTraceListQuery(request: FastifyRequest): TraceListQuery {
  const query = request.query as Record<string, string | undefined>;
  const parsedLimit = Number(query.limit ?? DEFAULT_TRACE_LIST_LIMIT);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(1, parsedLimit), MAX_TRACE_LIST_LIMIT)
    : DEFAULT_TRACE_LIST_LIMIT;
  const outcome = query.outcome;

  return {
    limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(outcome && TRACE_OUTCOMES.has(outcome as TraceOutcome)
      ? { outcome: outcome as TraceOutcome }
      : {}),
    ...(query.server ? { server: query.server } : {}),
    ...(query.q ? { q: query.q } : {}),
  };
}

function parseStatsWindowMs(request: FastifyRequest): number {
  const query = request.query as Record<string, string | undefined>;
  const parsed = Number(query.windowMs ?? DEFAULT_TRACE_STATS_WINDOW_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_TRACE_STATS_WINDOW_MS;
}

function memberOwnerId(request: FastifyRequest): string | undefined {
  const operator = requestOperator(request);
  return operator?.role === "member" ? operator.ownerId : undefined;
}

function traceVisible(
  request: FastifyRequest,
  trace: { principal?: { ownerId: string } },
): boolean {
  const ownerId = memberOwnerId(request);
  if (!ownerId) {
    return true;
  }
  return trace.principal?.ownerId === ownerId;
}

function scopeTraceQuery(
  request: FastifyRequest,
  query: TraceListQuery,
): TraceListQuery {
  const ownerId = memberOwnerId(request);
  return ownerId ? { ...query, ownerId } : query;
}

@injectable()
export class TracesApiController {
  constructor(
    @inject(TraceReadService)
    private readonly traceRead: TraceReadService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/traces/stats", async (request, reply) => {
      reply.send(
        await this.traceRead.getStats(
          parseStatsWindowMs(request),
          memberOwnerId(request),
        ),
      );
    });

    app.get("/api/traces/events", async (request, reply) => {
      const { writeEvent } = openSseStream(request, reply);

      const emit = (event: TraceSseEvent): void => {
        if (!traceVisible(request, event.trace)) {
          return;
        }
        writeEvent(event.type, event.trace);
      };

      for (const trace of (
        await this.traceRead.listTraces(scopeTraceQuery(request, { limit: 50 }))
      ).traces) {
        emit({
          type: TRACE_SSE_EVENT.traceCreated,
          trace,
        });
      }

      const unsubscribe = this.traceRead.subscribe(emit);

      request.raw.on("close", () => {
        unsubscribe();
      });
    });

    app.get("/api/traces/:traceId", async (request, reply) => {
      const { traceId } = request.params as { traceId: string };
      const trace = await this.traceRead.getTrace(traceId);
      if (!trace || !traceVisible(request, trace)) {
        reply.code(404).send({ error: "trace not found" });
        return;
      }
      reply.send(trace);
    });

    app.get("/api/traces", async (request, reply) => {
      reply.send(
        await this.traceRead.listTraces(
          scopeTraceQuery(request, parseTraceListQuery(request)),
        ),
      );
    });
  }
}
