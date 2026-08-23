import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { Logger, Task } from "@keidai/shared";
import type { Pool } from "@keidai/postgres";
import {
  authorizeBffServiceToken,
  resolveBffServiceToken,
} from "@keidai/shared/bff-service-token";
import type { FudaClient } from "@keidai/shared/clients";
import { RunsApiController } from "./runs-api.controller.js";
import { TasksApiController } from "./tasks-api.controller.js";
import type { RunStore } from "../runs/run-store.js";
import type { LaunchedHarnessRun, ResumeHarnessRunInput } from "../run/types/harness.js";
import { RunStopController } from "../run/run-stop-controller.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";
import type { ShaidenHttpServerHandle, ShaidenHttpServerOptions } from "./types/shaiden-http-server.js";
import { registerShaidenRoutes } from "./utils/register-shaiden-routes.js";
import { readPackageVersion } from "./utils/read-package-version.js";

const requestStartTime = Symbol("requestStartTime");

function readRequestPath(request: FastifyRequest): string {
  return request.url.split("?")[0] ?? request.url;
}

export interface ShaidenHttpServerDeps {
  runStore: RunStore;
  taskRepository: TaskRepository;
  logger: Logger;
  pool: Pool;
  startTaskRun: (input: {
    task: Task;
    taskId: string;
  }) => Promise<LaunchedHarnessRun>;
  resumeHarnessRun: (
    input: Omit<ResumeHarnessRunInput, "config">,
  ) => LaunchedHarnessRun | Promise<LaunchedHarnessRun>;
  runtimeConfig: import("../config/runtime-config.js").RuntimeConfig;
  /** When set, task create/patch validate assignee against Fuda. */
  fudaClient?: FudaClient;
  runStopController?: RunStopController;
}

export class ShaidenHttpServer {
  private app: FastifyInstance | null = null;
  private readonly runsApi: RunsApiController;
  private readonly tasksApi: TasksApiController;

  constructor(private readonly deps: ShaidenHttpServerDeps) {
    this.runsApi = new RunsApiController({
      runStore: deps.runStore,
      resumeHarnessRun: deps.resumeHarnessRun,
      runtimeConfig: deps.runtimeConfig,
      logger: deps.logger,
      runStopController: deps.runStopController ?? new RunStopController(),
    });
    this.tasksApi = new TasksApiController({
      runStore: deps.runStore,
      taskRepository: deps.taskRepository,
      startTaskRun: deps.startTaskRun,
      logger: deps.logger,
      fudaClient: deps.fudaClient,
    });
  }

  async createApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    const bffServiceToken = resolveBffServiceToken();

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

    app.addHook("onRequest", async (request, reply) => {
      const decision = authorizeBffServiceToken({
        expectedToken: bffServiceToken,
        authorization: request.headers.authorization,
        pathname: readRequestPath(request),
      });
      if (!decision.ok) {
        return reply.code(decision.statusCode).send({ error: decision.error });
      }
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
      await this.deps.pool.query("SELECT 1");
      reply.send({
        ok: true,
        version: readPackageVersion(),
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
