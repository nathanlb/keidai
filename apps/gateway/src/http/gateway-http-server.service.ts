import Fastify, { type FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { ConfigReadService } from "../config/config-read.service.js";
import { GatewayMcpServer } from "../mcp/gateway-mcp-server.service.js";
import type {
  GatewayHttpServerHandle,
  GatewayHttpServerOptions,
} from "./types/gateway-http-server.js";
import { registerGatewayRoutes } from "./utils/register-gateway-routes.js";

@injectable()
export class GatewayHttpServer {
  private app: FastifyInstance | null = null;

  constructor(
    @inject(ConfigReadService)
    private readonly configRead: ConfigReadService,
    @inject(GatewayMcpServer)
    private readonly mcpServer: GatewayMcpServer,
  ) {}

  createApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    registerGatewayRoutes(app, {
      configRead: this.configRead,
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
