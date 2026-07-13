import {
  taskSchema,
  type Logger,
  type StartTaskRunResponse,
  type Task,
} from "@keidai/shared";
import type { FastifyInstance } from "fastify";
import type { RunStore } from "../runs/run-store.js";
import type { LaunchedHarnessRun } from "../run/harness.js";

export type StartTaskRun = (task: Task) => LaunchedHarnessRun;

export interface TasksApiControllerOptions {
  agentId: string;
  runStore: RunStore;
  startTaskRun: StartTaskRun;
  logger: Logger;
}

export class TasksApiController {
  private readonly agentId: string;
  private readonly runStore: RunStore;
  private readonly startTaskRun: StartTaskRun;
  private readonly logger: Logger;

  constructor(options: TasksApiControllerOptions) {
    this.agentId = options.agentId;
    this.runStore = options.runStore;
    this.startTaskRun = options.startTaskRun;
    this.logger = options.logger;
  }

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/tasks/runtime", async (_request, reply) => {
      reply.send({ agentId: this.agentId });
    });

    app.post("/api/tasks/run", async (request, reply) => {
      const parsed = taskSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid task",
          details: parsed.error.flatten(),
        });
        return;
      }

      const task = parsed.data;
      if (task.assignee !== this.agentId) {
        reply.code(400).send({
          error: `assignee must match the Shaiden agent (${this.agentId})`,
        });
        return;
      }

      const hasRunning = this.runStore
        .listRuns()
        .runs.some((run) => run.status === "running");
      if (hasRunning) {
        reply.code(409).send({ error: "a run is already in progress" });
        return;
      }

      const { runId, done } = this.startTaskRun(task);
      done.catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error("task.run_failed", { runId, error: message });
      });

      const body: StartTaskRunResponse = { runId };
      reply.code(202).send(body);
    });
  }
}
