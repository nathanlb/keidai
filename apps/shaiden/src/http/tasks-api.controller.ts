import {
  taskSchema,
  type Logger,
  type StartTaskRunResponse,
  type Task,
} from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RunStore } from "../runs/run-store.js";
import type { LaunchedHarnessRun } from "../run/harness.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";
import {
  DEFAULT_TASK_LIST_LIMIT,
  MAX_TASK_LIST_LIMIT,
} from "../tasks/types/task-repository.js";

function parseTaskListLimit(request: FastifyRequest): number {
  const query = request.query as Record<string, string | undefined>;
  const parsedLimit = Number(query.limit ?? DEFAULT_TASK_LIST_LIMIT);
  return Number.isFinite(parsedLimit)
    ? Math.min(Math.max(1, parsedLimit), MAX_TASK_LIST_LIMIT)
    : DEFAULT_TASK_LIST_LIMIT;
}

export type StartTaskRun = (input: {
  task: Task;
  taskId: string;
}) => LaunchedHarnessRun;

export interface TasksApiControllerOptions {
  agentId: string;
  runStore: RunStore;
  taskRepository: TaskRepository;
  startTaskRun: StartTaskRun;
  logger: Logger;
}

export class TasksApiController {
  private readonly agentId: string;
  private readonly runStore: RunStore;
  private readonly taskRepository: TaskRepository;
  private readonly startTaskRun: StartTaskRun;
  private readonly logger: Logger;

  constructor(options: TasksApiControllerOptions) {
    this.agentId = options.agentId;
    this.runStore = options.runStore;
    this.taskRepository = options.taskRepository;
    this.startTaskRun = options.startTaskRun;
    this.logger = options.logger;
  }

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/tasks/runtime", async (_request, reply) => {
      reply.send({ agentId: this.agentId });
    });

    app.get("/api/tasks", async (request, reply) => {
      reply.send(this.taskRepository.list(parseTaskListLimit(request)));
    });

    app.post("/api/tasks", async (request, reply) => {
      const parsed = taskSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid task",
          details: parsed.error.flatten(),
        });
        return;
      }

      const assigneeError = this.validateAssignee(parsed.data.assignee);
      if (assigneeError) {
        reply.code(400).send({ error: assigneeError });
        return;
      }

      const task = this.taskRepository.create({ task: parsed.data });
      reply.code(201).send({ task });
    });

    app.get("/api/tasks/:taskId", async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const task = this.taskRepository.get(taskId);
      if (!task) {
        reply.code(404).send({ error: "task not found" });
        return;
      }
      reply.send({ task });
    });

    app.patch("/api/tasks/:taskId", async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const body = request.body as Record<string, unknown>;
      const parsed = taskSchema.partial().safeParse(body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid task update",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (parsed.data.assignee !== undefined) {
        const assigneeError = this.validateAssignee(parsed.data.assignee);
        if (assigneeError) {
          reply.code(400).send({ error: assigneeError });
          return;
        }
      }

      const task = this.taskRepository.update(taskId, parsed.data);
      if (!task) {
        reply.code(404).send({ error: "task not found" });
        return;
      }
      reply.send({ task });
    });

    app.delete("/api/tasks/:taskId", async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const existing = this.taskRepository.get(taskId);
      if (!existing) {
        reply.code(404).send({ error: "task not found" });
        return;
      }

      if (this.taskRepository.hasRuns(taskId)) {
        reply.code(409).send({ error: "task has runs and cannot be deleted" });
        return;
      }

      this.taskRepository.delete(taskId);
      reply.code(204).send();
    });

    app.post("/api/tasks/:taskId/run", async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const saved = this.taskRepository.get(taskId);
      if (!saved) {
        reply.code(404).send({ error: "task not found" });
        return;
      }

      const response = this.startRunForTask(saved, taskId);
      if ("error" in response) {
        reply.code(response.status).send({ error: response.error });
        return;
      }

      reply.code(202).send(response.body);
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

      const assigneeError = this.validateAssignee(parsed.data.assignee);
      if (assigneeError) {
        reply.code(400).send({ error: assigneeError });
        return;
      }

      const saved = this.taskRepository.create({ task: parsed.data });
      const response = this.startRunForTask(saved, saved.id);
      if ("error" in response) {
        reply.code(response.status).send({ error: response.error });
        return;
      }

      reply.code(202).send(response.body);
    });
  }

  private validateAssignee(assignee: string): string | null {
    if (assignee !== this.agentId) {
      return `assignee must match the Shaiden agent (${this.agentId})`;
    }
    return null;
  }

  private hasRunningRun(): boolean {
    return this.runStore
      .listRuns()
      .runs.some((run) => run.status === "running");
  }

  private startRunForTask(
    saved: { id: string; goal: string; trigger: Task["trigger"]; assignee: string; limits?: Task["limits"] },
    taskId: string,
  ):
    | { body: StartTaskRunResponse }
    | { error: string; status: number } {
    const task = taskSchema.parse({
      goal: saved.goal,
      trigger: saved.trigger,
      assignee: saved.assignee,
      limits: saved.limits,
    });

    const assigneeError = this.validateAssignee(task.assignee);
    if (assigneeError) {
      return { error: assigneeError, status: 400 };
    }

    if (this.hasRunningRun()) {
      return { error: "a run is already in progress", status: 409 };
    }

    const { runId, done } = this.startTaskRun({ task, taskId });
    done.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("task.run_failed", { runId, taskId, error: message });
    });

    return { body: { runId, taskId } };
  }
}
