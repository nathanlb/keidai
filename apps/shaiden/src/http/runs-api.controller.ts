import {
  RUN_SSE_EVENT,
  type FollowUpRunResponse,
  type RunReport,
  type RunSseEvent,
} from "@keidai/shared";
import type { Logger } from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { ActiveRunRegistry } from "../run/active-run-registry.js";
import type { RunStore } from "../runs/run-store.js";
import {
  DEFAULT_RUN_LIST_LIMIT,
  MAX_RUN_LIST_LIMIT,
} from "../runs/types/run-repository.js";
import {
  createUserMessageStep,
  isEligibleContinuationOutcome,
} from "../runs/utils/conversation-history.js";
import { createRunStep } from "../runs/utils/create-run-step.js";
import {
  followUpConflictMessage,
  normalizeFollowUpMessage,
} from "./utils/follow-up-message.js";

function parseRunListLimit(request: FastifyRequest): number {
  const query = request.query as Record<string, string | undefined>;
  const parsedLimit = Number(query.limit ?? DEFAULT_RUN_LIST_LIMIT);
  return Number.isFinite(parsedLimit)
    ? Math.min(Math.max(1, parsedLimit), MAX_RUN_LIST_LIMIT)
    : DEFAULT_RUN_LIST_LIMIT;
}

export interface RunsApiControllerDeps {
  runStore: RunStore;
  activeRunRegistry: ActiveRunRegistry;
  resumeHarnessRun: (
    input: Omit<import("../run/harness.js").ResumeHarnessRunInput, "config">,
  ) => import("../run/harness.js").LaunchedHarnessRun;
  runtimeConfig: RuntimeConfig;
  logger: Logger;
}

export class RunsApiController {
  constructor(private readonly deps: RunsApiControllerDeps) {}

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

      for (const item of this.deps.runStore.listRuns(50).runs) {
        const run = this.deps.runStore.getRun(item.id);
        if (run) {
          writeEvent({
            type: RUN_SSE_EVENT.runUpdated,
            run,
          });
        }
      }

      const unsubscribe = this.deps.runStore.subscribe(writeEvent);

      request.raw.on("close", () => {
        unsubscribe();
      });
    });

    app.get("/api/runs/:runId", async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const run = this.deps.runStore.getRun(runId);
      if (!run) {
        reply.code(404).send({ error: "run not found" });
        return;
      }
      reply.send(run);
    });

    app.get("/api/runs", async (request, reply) => {
      reply.send(this.deps.runStore.listRuns(parseRunListLimit(request)));
    });

    app.post("/api/runs/:runId/follow-up", async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const message = normalizeFollowUpMessage(
        request.body as import("@keidai/shared").FollowUpRunRequest,
      );
      if (!message) {
        reply.code(400).send({ error: "invalid follow-up message" });
        return;
      }

      const run = this.deps.runStore.getRun(runId);
      if (!run) {
        reply.code(404).send({ error: "run not found" });
        return;
      }

      const response = this.handleFollowUp(run, runId, message);
      reply.code(response.status).send(response.body);
    });
  }

  private handleFollowUp(
    run: RunReport,
    runId: string,
    message: string,
  ): { status: number; body: FollowUpRunResponse | { error: string } } {
    const activeHandle = this.deps.activeRunRegistry.get(runId);
    if (activeHandle) {
      if (!activeHandle.queueUserMessageIfWaiting(message)) {
        return {
          status: 409,
          body: { error: followUpConflictMessage("not_terminal") },
        };
      }

      this.deps.runStore.appendStep(
        runId,
        createRunStep(createUserMessageStep(message)),
      );
      return { status: 202, body: { runId } };
    }

    if (run.status === "running") {
      return {
        status: 409,
        body: { error: followUpConflictMessage("lost_handle") },
      };
    }

    if (run.status !== "completed" || !isEligibleContinuationOutcome(run.outcome)) {
      return {
        status: 409,
        body: { error: followUpConflictMessage("ineligible_outcome") },
      };
    }

    const continuation = this.deps.runStore.beginContinuation(
      runId,
      message,
      createRunStep(createUserMessageStep(message)),
    );
    if (!continuation.ok) {
      return {
        status: 409,
        body: { error: followUpConflictMessage(continuation.reason) },
      };
    }

    const { done } = this.deps.resumeHarnessRun({
      runId,
      initialHistory: continuation.history,
      task: run.task,
      runStore: this.deps.runStore,
      options: {
        activeRunRegistry: this.deps.activeRunRegistry,
        logger: this.deps.logger,
      },
    });
    done.catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.deps.logger.error("run.follow_up_failed", {
        runId,
        error: errorMessage,
      });
    });

    return { status: 202, body: { runId } };
  }
}
