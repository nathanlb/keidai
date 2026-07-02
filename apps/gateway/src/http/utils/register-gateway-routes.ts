import type { FastifyInstance } from "fastify";
import type { ConnectionsApiController } from "../../connections/connections-api.controller.js";
import type { ConfigApiController } from "../../config/config-api.controller.js";
import type { OAuthApiController } from "../../credentials/oauth-api.controller.js";
import type { GatewayMcpServer } from "../../mcp/gateway-mcp-server.service.js";
import type { TracesApiController } from "../../trace/traces-api.controller.js";

export interface GatewayRouteControllers {
  configApi: ConfigApiController;
  connectionsApi: ConnectionsApiController;
  oauthApi: OAuthApiController;
  tracesApi: TracesApiController;
  mcpServer: GatewayMcpServer;
}

/** Composes HTTP route controllers from each domain onto a shared Fastify instance. */
export function registerGatewayRoutes(
  app: FastifyInstance,
  controllers: GatewayRouteControllers,
): void {
  controllers.configApi.registerRoutes(app);
  controllers.connectionsApi.registerRoutes(app);
  controllers.oauthApi.registerRoutes(app);
  controllers.tracesApi.registerRoutes(app);
  controllers.mcpServer.registerRoutes(app);
}
