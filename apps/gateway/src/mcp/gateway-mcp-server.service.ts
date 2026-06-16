import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import Fastify, { type FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import type {
  GatewayMcpServerHandle,
  GatewayMcpServerOptions,
} from "./types/gateway-mcp-server.js";

@injectable()
export class GatewayMcpServer {
  private app: FastifyInstance | null = null;

  constructor(
    @inject(ToolCatalogService)
    private readonly toolCatalog: ToolCatalogService,
  ) {}

  createApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    this.registerRoutes(app);
    return app;
  }

  async start(
    options: GatewayMcpServerOptions = {},
  ): Promise<GatewayMcpServerHandle> {
    const host = options.host ?? "127.0.0.1";
    const app = this.createApp();
    this.app = app;

    const port = options.port ?? 0;
    await app.listen({ host, port });

    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve gateway MCP server address");
    }

    return {
      url: `http://${host}:${address.port}/mcp`,
      close: async () => {
        await app.close();
        this.app = null;
      },
    };
  }

  private registerRoutes(app: FastifyInstance): void {
    app.post("/mcp", async (request, reply) => {
      const mcpServer = this.createMcpServer();

      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await mcpServer.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, request.body);
        reply.hijack();

        request.raw.on("close", () => {
          void transport.close();
          void mcpServer.close();
        });
      } catch (error) {
        console.error("Error handling gateway MCP request:", error);
        if (!reply.raw.headersSent) {
          reply
            .code(500)
            .send({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal server error",
              },
              id: null,
            });
        }
      }
    });

    app.get("/mcp", async (_request, reply) => {
      reply.code(405).send({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      });
    });
  }

  private createMcpServer(): McpServer {
    const mcpServer = new McpServer(
      { name: "open-torii-gateway", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );

    mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: await this.toolCatalog.listToolsForAgent(),
    }));

    return mcpServer;
  }
}
