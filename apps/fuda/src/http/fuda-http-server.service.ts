import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import type { Logger } from "@keidai/shared";
import { AgentDefinitionApiController } from "../agents/agent-definition-api.controller.js";
import { AgentsManagementApiController } from "../agents/agents-management-api.controller.js";
import { BearersManagementApiController } from "../bearers/bearers-management-api.controller.js";
import { FudaConfigService } from "../config/fuda-config.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import { JwksApiController } from "../signing/jwks-api.controller.js";
import type { RouteGroup } from "./types/route-group.js";
import type {
  FudaHttpServerHandle,
  FudaHttpServerOptions,
} from "./types/fuda-http-server.js";
import { registerRouteGroups } from "./utils/register-route-groups.js";
import { readPackageVersion } from "./utils/read-package-version.js";

const requestStartTime = Symbol("requestStartTime");

function readRequestPath(request: FastifyRequest): string {
  return request.url.split("?")[0] ?? request.url;
}

@injectable()
export class FudaHttpServer {
  private app: FastifyInstance | null = null;

  constructor(
    @inject(FudaConfigService)
    private readonly configService: FudaConfigService,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
    @inject(JwksApiController)
    private readonly jwks: JwksApiController,
    @inject(AgentsManagementApiController)
    private readonly agentsManagement: AgentsManagementApiController,
    @inject(BearersManagementApiController)
    private readonly bearersManagement: BearersManagementApiController,
    @inject(AgentDefinitionApiController)
    private readonly agentDefinition: AgentDefinitionApiController,
  ) {}

  async createApp(
    listenGroups: readonly RouteGroup[] = this.configService.get().listenGroups,
  ): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    app.addHook("onRequest", async (request) => {
      (request as FastifyRequest & { [requestStartTime]?: number })[
        requestStartTime
      ] = Date.now();
    });

    app.addHook("onResponse", async (request, reply) => {
      const startedAt =
        (request as FastifyRequest & { [requestStartTime]?: number })[
          requestStartTime
        ] ?? Date.now();
      this.logger.info("http.request", {
        method: request.method,
        url: readRequestPath(request),
        statusCode: reply.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    app.get("/api/health", async (_request, reply) => {
      reply.send({ ok: true, version: readPackageVersion() });
    });

    registerRouteGroups(app, listenGroups, {
      jwks: this.jwks,
      agentsManagement: this.agentsManagement,
      bearersManagement: this.bearersManagement,
      agentDefinition: this.agentDefinition,
    });

    return app;
  }

  async start(
    options: FudaHttpServerOptions = {},
  ): Promise<FudaHttpServerHandle> {
    const config = this.configService.get();
    const host = options.host ?? config.httpHost;
    const app = await this.createApp(config.listenGroups);
    this.app = app;

    const port = options.port ?? config.httpPort;
    await app.listen({ host, port });

    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve Fuda HTTP server address");
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
