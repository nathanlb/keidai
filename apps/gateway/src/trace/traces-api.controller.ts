import {
  TRACE_SSE_EVENT,
  type TraceListQuery,
  type TraceOutcome,
  type TraceSseEvent,
} from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { TraceReadService } from "./trace-read.service.js";
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

@injectable()
export class TracesApiController {
  constructor(
    @inject(TraceReadService)
    private readonly traceRead: TraceReadService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/traces/stats", async (request, reply) => {
      reply.send(this.traceRead.getStats(parseStatsWindowMs(request)));
    });

    app.get("/api/traces/events", (request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const writeEvent = (event: TraceSseEvent): void => {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event.trace)}\n\n`);
      };

      for (const trace of this.traceRead.listTraces({ limit: 50 }).traces) {
        writeEvent({
          type: TRACE_SSE_EVENT.traceCreated,
          trace,
        });
      }

      const unsubscribe = this.traceRead.subscribe(writeEvent);

      request.raw.on("close", () => {
        unsubscribe();
      });
    });

    app.get("/api/traces/:traceId", async (request, reply) => {
      const { traceId } = request.params as { traceId: string };
      const trace = this.traceRead.getTrace(traceId);
      if (!trace) {
        reply.code(404).send({ error: "trace not found" });
        return;
      }
      reply.send(trace);
    });

    app.get("/api/traces", async (request, reply) => {
      reply.send(this.traceRead.listTraces(parseTraceListQuery(request)));
    });
  }
}
