import {
  taskSchema,
  type Logger,
  type StartTaskRunResponse,
  type Task,
} from "@keidai/shared";
import {
  AgentDefinitionError,
  type FudaClient,
} from "@keidai/shared/clients";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RunStore } from "../runs/run-store.js";
import type { LaunchedHarnessRun } from "../run/types/harness.js";
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

type AgentDefinitionPhase = "creation" | "start";

function describeAgentDefinitionFailure(
  error: AgentDefinitionError,
  phase: AgentDefinitionPhase,
): {
  status: number;
  error: string;
} {
  if (error.kind === "agent_not_found") {
    return {
      status: 422,
      error: "unknown agent",
    };
  }
  if (error.kind === "unreachable") {
    return {
      status: 503,
      error: `Fuda unreachable at task ${phase}: ${error.message}`,
    };
  }
  return {
    status: 502,
    error: `failed to fetch agent definition: ${error.message}`,
  };
}

export type StartTaskRun = (input: {
  task: Task;
  taskId: string;
}) => Promise<LaunchedHarnessRun>;

export interface TasksApiControllerOptions {
  agentId: string;
  runStore: RunStore;
  taskRepository: TaskRepository;
  startTaskRun: StartTaskRun;
  logger: Logger;
  /**
   * When set, create/patch validate `assignee` against Fuda's opaque agent id
   * via `GET /agents/{id}` before persisting. Optional so evals/tests can omit.
   */
  fudaClient?: FudaClient;
}

export class TasksApiController {
  private readonly agentId: string;
  private readonly runStore: RunStore;
  private readonly taskRepository: TaskRepository;
  private readonly startTaskRun: StartTaskRun;
  private readonly logger: Logger;
  private readonly fudaClient: FudaClient | undefined;

  constructor(options: TasksApiControllerOptions) {
    this.agentId = options.agentId;
    this.runStore = options.runStore;
    this.taskRepository = options.taskRepository;
    this.startTaskRun = options.startTaskRun;
    this.logger = options.logger;
    this.fudaClient = options.fudaClient;
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

      const assigneeError = await this.validateAssignee(parsed.data.assignee);
      if (assigneeError) {
        reply.code(assigneeError.status).send({ error: assigneeError.error });
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
        const assigneeError = await this.validateAssignee(parsed.data.assignee);
        if (assigneeError) {
          reply.code(assigneeError.status).send({ error: assigneeError.error });
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

      const response = await this.startRunForTask(saved, taskId);
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

      const assigneeError = await this.validateAssignee(parsed.data.assignee);
      if (assigneeError) {
        reply.code(assigneeError.status).send({ error: assigneeError.error });
        return;
      }

      const saved = this.taskRepository.create({ task: parsed.data });
      const response = await this.startRunForTask(saved, saved.id, {
        deleteTaskOnStartFailure: true,
      });
      if ("error" in response) {
        reply.code(response.status).send({ error: response.error });
        return;
      }

      reply.code(202).send(response.body);
    });
  }

  private async validateAssignee(
    assignee: string,
  ): Promise<{ error: string; status: number } | null> {
    if (assignee !== this.agentId) {
      return {
        error: `assignee must match the Shaiden agent (${this.agentId})`,
        status: 400,
      };
    }

    if (!this.fudaClient) {
      return null;
    }

    try {
      await this.fudaClient.getAgentDefinition(assignee);
      return null;
    } catch (error) {
      if (error instanceof AgentDefinitionError) {
        return describeAgentDefinitionFailure(error, "creation");
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: `failed to fetch agent definition: ${message}`,
        status: 502,
      };
    }
  }

  private hasRunningRun(): boolean {
    return this.runStore
      .listRuns()
      .runs.some((run) => run.status === "running");
  }

  private async startRunForTask(
    saved: {
      id: string;
      goal: string;
      trigger: Task["trigger"];
      assignee: string;
      limits?: Task["limits"];
    },
    taskId: string,
    options: { deleteTaskOnStartFailure?: boolean } = {},
  ): Promise<
    | { body: StartTaskRunResponse }
    | { error: string; status: number }
  > {
    const task = taskSchema.parse({
      goal: saved.goal,
      trigger: saved.trigger,
      assignee: saved.assignee,
      limits: saved.limits,
    });

    const assigneeError = await this.validateAssignee(task.assignee);
    if (assigneeError) {
      return assigneeError;
    }

    if (this.hasRunningRun()) {
      return { error: "a run is already in progress", status: 409 };
    }

    let runId: string;
    let done: Promise<unknown>;
    try {
      ({ runId, done } = await this.startTaskRun({ task, taskId }));
    } catch (error) {
      if (options.deleteTaskOnStartFailure) {
        this.taskRepository.delete(taskId);
      }
      if (error instanceof AgentDefinitionError) {
        return describeAgentDefinitionFailure(error, "start");
      }
      const message = error instanceof Error ? error.message : String(error);
      return { error: `task start failed: ${message}`, status: 500 };
    }

    done.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("task.run_failed", { runId, taskId, error: message });
    });

    return { body: { runId, taskId } };
  }
}
