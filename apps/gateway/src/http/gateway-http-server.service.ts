import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { ConnectionsApiController } from "../connections/connections-api.controller.js";
import { ConfigApiController } from "../config/config-api.controller.js";
import { OAuthApiController } from "../credentials/oauth-api.controller.js";
import { GatewayMcpServer } from "../mcp/gateway-mcp-server.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "../logging/types/logger.js";
import type {
  GatewayHttpServerHandle,
  GatewayHttpServerOptions,
} from "./types/gateway-http-server.js";
import { registerGatewayRoutes } from "./utils/register-gateway-routes.js";

const requestStartTime = Symbol("requestStartTime");

function readRequestPath(request: FastifyRequest): string {
  return request.url.split("?")[0] ?? request.url;
}

@injectable()
export class GatewayHttpServer {
  private app: FastifyInstance | null = null;

  constructor(
    @inject(ConfigApiController)
    private readonly configApi: ConfigApiController,
    @inject(ConnectionsApiController)
    private readonly connectionsApi: ConnectionsApiController,
    @inject(OAuthApiController)
    private readonly oauthApi: OAuthApiController,
    @inject(GatewayMcpServer)
    private readonly mcpServer: GatewayMcpServer,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
  ) {}

  createApp(): FastifyInstance {
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

    registerGatewayRoutes(app, {
      configApi: this.configApi,
      connectionsApi: this.connectionsApi,
      oauthApi: this.oauthApi,
      mcpServer: this.mcpServer,
    });
    return app;
  }

  async start(
    options: GatewayHttpServerOptions = {},
  ): Promise<GatewayHttpServerHandle> {
    const host = options.host ?? "127.0.0.1";
    const app = this.createApp();
    this.app = app;

    const port = options.port ?? 0;
    await app.listen({ host, port });

    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve gateway HTTP server address");
    }

    const baseUrl = `http://${host}:${address.port}`;
    const mcpUrl = `${baseUrl}/mcp`;

    return {
      baseUrl,
      mcpUrl,
      url: mcpUrl,
      close: async () => {
        await app.close();
        this.app = null;
      },
    };
  }
}
