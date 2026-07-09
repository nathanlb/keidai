import {
  RUN_SSE_EVENT,
  type RunSseEvent,
} from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RunStore } from "../runs/run-store.js";
import {
  DEFAULT_RUN_LIST_LIMIT,
  MAX_RUN_LIST_LIMIT,
} from "../runs/types/run-repository.js";

function parseRunListLimit(request: FastifyRequest): number {
  const query = request.query as Record<string, string | undefined>;
  const parsedLimit = Number(query.limit ?? DEFAULT_RUN_LIST_LIMIT);
  return Number.isFinite(parsedLimit)
    ? Math.min(Math.max(1, parsedLimit), MAX_RUN_LIST_LIMIT)
    : DEFAULT_RUN_LIST_LIMIT;
}

export class RunsApiController {
  constructor(private readonly runStore: RunStore) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/runs/events", (request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const writeEvent = (event: RunSseEvent): void => {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event.run)}\n\n`);
      };

      for (const item of this.runStore.listRuns(50).runs) {
        const run = this.runStore.getRun(item.id);
        if (run) {
          writeEvent({
            type: RUN_SSE_EVENT.runUpdated,
            run,
          });
        }
      }

      const unsubscribe = this.runStore.subscribe(writeEvent);

      request.raw.on("close", () => {
        unsubscribe();
      });
    });

    app.get("/api/runs/:runId", async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const run = this.runStore.getRun(runId);
      if (!run) {
        reply.code(404).send({ error: "run not found" });
        return;
      }
      reply.send(run);
    });

    app.get("/api/runs", async (request, reply) => {
      reply.send(this.runStore.listRuns(parseRunListLimit(request)));
    });
  }
}
