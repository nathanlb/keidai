import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { Logger, Task } from "@keidai/shared";
import { RunsApiController } from "./runs-api.controller.js";
import { TasksApiController } from "./tasks-api.controller.js";
import type { RunStore } from "../runs/run-store.js";
import type { LaunchedHarnessRun, ResumeHarnessRunInput } from "../run/types/harness.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";
import type { ShaidenHttpServerHandle, ShaidenHttpServerOptions } from "./types/shaiden-http-server.js";
import { registerShaidenRoutes } from "./utils/register-shaiden-routes.js";
import { readPackageVersion } from "./utils/read-package-version.js";
import type { ActiveRunRegistry } from "../run/active-run-registry.js";

const requestStartTime = Symbol("requestStartTime");

function readRequestPath(request: FastifyRequest): string {
  return request.url.split("?")[0] ?? request.url;
}

export interface ShaidenHttpServerDeps {
  runStore: RunStore;
  taskRepository: TaskRepository;
  logger: Logger;
  agentId: string;
  startTaskRun: (input: {
    task: Task;
    taskId: string;
  }) => LaunchedHarnessRun;
  resumeHarnessRun: (
    input: Omit<ResumeHarnessRunInput, "config">,
  ) => LaunchedHarnessRun;
  activeRunRegistry: ActiveRunRegistry;
  runtimeConfig: import("../config/runtime-config.js").RuntimeConfig;
}

export class ShaidenHttpServer {
  private app: FastifyInstance | null = null;
  private readonly runsApi: RunsApiController;
  private readonly tasksApi: TasksApiController;
  private readonly agentId: string;

  constructor(private readonly deps: ShaidenHttpServerDeps) {
    this.agentId = deps.agentId;
    this.runsApi = new RunsApiController({
      runStore: deps.runStore,
      activeRunRegistry: deps.activeRunRegistry,
      resumeHarnessRun: deps.resumeHarnessRun,
      runtimeConfig: deps.runtimeConfig,
      logger: deps.logger,
    });
    this.tasksApi = new TasksApiController({
      agentId: deps.agentId,
      runStore: deps.runStore,
      taskRepository: deps.taskRepository,
      startTaskRun: deps.startTaskRun,
      logger: deps.logger,
    });
  }

  async createApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    app.addHook("onRequest", async (request, reply) => {
      (request as FastifyRequest & { [requestStartTime]?: number })[
        requestStartTime
      ] = Date.now();
      // Browser clients may call Shaiden cross-origin when the UI is served
      // from Torii (or another origin) rather than the Vite proxy.
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");
    });

    app.options("/*", async (_request, reply) => {
      reply.code(204).send();
    });

    app.addHook("onResponse", async (request, reply) => {
      const startedAt =
        (request as FastifyRequest & { [requestStartTime]?: number })[
          requestStartTime
        ] ?? Date.now();
      this.deps.logger.info("http.request", {
        method: request.method,
        url: readRequestPath(request),
        statusCode: reply.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    app.get("/api/health", async (_request, reply) => {
      reply.send({
        ok: true,
        version: readPackageVersion(),
        agentId: this.agentId,
      });
    });

    registerShaidenRoutes(app, {
      runsApi: this.runsApi,
      tasksApi: this.tasksApi,
    });

    return app;
  }

  async start(
    options: ShaidenHttpServerOptions = {},
  ): Promise<ShaidenHttpServerHandle> {
    const host = options.host ?? "127.0.0.1";
    const app = await this.createApp();
    this.app = app;

    const port = options.port ?? 0;
    await app.listen({ host, port });

    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve Shaiden HTTP server address");
    }

    const baseUrl = `http://${host}:${address.port}`;

    return {
      baseUrl,
      close: async () => {
        await app.close();
        this.app = null;
      },
    };
  }
}
