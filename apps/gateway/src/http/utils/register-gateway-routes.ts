import type { FastifyInstance } from "fastify";
import type { ConfigReadService } from "../../config/config-read.service.js";
import { registerConfigApiRoutes } from "../../config/utils/register-config-api-routes.js";
import type { GatewayMcpServer } from "../../mcp/gateway-mcp-server.service.js";

export interface GatewayRouteDeps {
  configRead: ConfigReadService;
  mcpServer: GatewayMcpServer;
}

/** Composes HTTP route modules from each domain onto a shared Fastify instance. */
export function registerGatewayRoutes(
  app: FastifyInstance,
  deps: GatewayRouteDeps,
): void {
  registerConfigApiRoutes(app, deps.configRead);
  deps.mcpServer.registerRoutes(app);
}
