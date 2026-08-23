import {
  RUN_SSE_EVENT,
  type FollowUpRunRequest,
  type FollowUpRunResponse,
  type Logger,
  type ResumeRunResponse,
  type RunReport,
  type RunSseEvent,
  type StopRunResponse,
} from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { RunStopController } from "../run/run-stop-controller.js";
import type {
  LaunchedHarnessRun,
  ResumeHarnessRunInput,
} from "../run/types/harness.js";
import type { ConversationEntry } from "../run/types/conversation-history.js";
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
  resumeConflictMessage,
  stopConflictMessage,
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
  resumeHarnessRun: (
    input: Omit<ResumeHarnessRunInput, "config">,
  ) => LaunchedHarnessRun | Promise<LaunchedHarnessRun>;
  runtimeConfig: RuntimeConfig;
  logger: Logger;
  runStopController: RunStopController;
}

export class RunsApiController {
  constructor(private readonly deps: RunsApiControllerDeps) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/runs/events", async (request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
      });
      // Flush headers + open the stream so proxies do not buffer early events.
      reply.raw.write(": connected\n\n");

      const writeEvent = (event: RunSseEvent): void => {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event.run)}\n\n`);
      };

      for (const item of (await this.deps.runStore.listRuns(50)).runs) {
        const run = await this.deps.runStore.getRun(item.id);
        if (run) {
          writeEvent({
            type: RUN_SSE_EVENT.runUpdated,
            run,
          });
        }
      }

      const unsubscribe = this.deps.runStore.subscribe(writeEvent);
      const keepalive = setInterval(() => {
        reply.raw.write(": keepalive\n\n");
      }, 15_000);

      request.raw.on("close", () => {
        clearInterval(keepalive);
        unsubscribe();
      });
    });

    app.get("/api/runs/:runId", async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const run = await this.deps.runStore.getRun(runId);
      if (!run) {
        reply.code(404).send({ error: "run not found" });
        return;
      }
      reply.send(run);
    });

    app.get("/api/runs", async (request, reply) => {
      reply.send(await this.deps.runStore.listRuns(parseRunListLimit(request)));
    });

    app.post("/api/runs/:runId/follow-up", async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const message = normalizeFollowUpMessage(
        request.body as FollowUpRunRequest,
      );
      if (!message) {
        reply.code(400).send({ error: "invalid follow-up message" });
        return;
      }

      const run = await this.deps.runStore.getRun(runId);
      if (!run) {
        reply.code(404).send({ error: "run not found" });
        return;
      }

      const response = await this.handleFollowUp(run, runId, message);
      reply.code(response.status).send(response.body);
    });

    app.post("/api/runs/:runId/stop", async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const run = await this.deps.runStore.getRun(runId);
      if (!run) {
        reply.code(404).send({ error: "run not found" });
        return;
      }

      const response = await this.handleStop(run, runId);
      reply.code(response.status).send(response.body);
    });

    app.post("/api/runs/:runId/resume", async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const run = await this.deps.runStore.getRun(runId);
      if (!run) {
        reply.code(404).send({ error: "run not found" });
        return;
      }

      const response = await this.handleResume(run, runId);
      reply.code(response.status).send(response.body);
    });
  }

  private async handleFollowUp(
    run: RunReport,
    runId: string,
    message: string,
  ): Promise<{ status: number; body: FollowUpRunResponse | { error: string } }> {
    if (run.status === "running") {
      const queued = await this.deps.runStore.enqueueParkedFollowUp(
        runId,
        message,
        createRunStep(createUserMessageStep(message)),
      );
      if (queued) {
        return { status: 202, body: { runId } };
      }
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

    const continuation = await this.deps.runStore.beginContinuation(
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

    return this.launchContinuation(run, runId, continuation.history, "follow_up");
  }

  private async handleStop(
    run: RunReport,
    runId: string,
  ): Promise<{ status: number; body: StopRunResponse | { error: string } }> {
    if (run.status !== "running") {
      return {
        status: 409,
        body: { error: stopConflictMessage("not_running") },
      };
    }

    if (await this.deps.runStore.getParkedMcpTask(runId)) {
      return {
        status: 409,
        body: { error: stopConflictMessage("waiting_approval") },
      };
    }

    this.deps.runStopController.requestStop(runId);
    return { status: 202, body: { runId } };
  }

  private async handleResume(
    run: RunReport,
    runId: string,
  ): Promise<{ status: number; body: ResumeRunResponse | { error: string } }> {
    if (run.status === "running") {
      return {
        status: 409,
        body: { error: resumeConflictMessage("not_terminal") },
      };
    }

    if (run.status !== "completed" || run.outcome?.status !== "stopped") {
      return {
        status: 409,
        body: { error: resumeConflictMessage("not_stopped") },
      };
    }

    const continuation = await this.deps.runStore.beginContinuation(runId);
    if (!continuation.ok) {
      return {
        status: 409,
        body: { error: resumeConflictMessage(continuation.reason) },
      };
    }

    return this.launchContinuation(run, runId, continuation.history, "resume");
  }

  private async launchContinuation(
    run: RunReport,
    runId: string,
    initialHistory: ConversationEntry[],
    kind: "follow_up" | "resume",
  ): Promise<{ status: number; body: FollowUpRunResponse }> {
    const { done } = await this.deps.resumeHarnessRun({
      runId,
      initialHistory,
      task: run.task,
      runStore: this.deps.runStore,
      options: {
        logger: this.deps.logger,
      },
    });
    done.catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.deps.logger.error(
        kind === "resume" ? "run.resume_failed" : "run.follow_up_failed",
        {
          runId,
          error: errorMessage,
        },
      );
    });

    return { status: 202, body: { runId } };
  }
}
