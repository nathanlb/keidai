import type { FastifyInstance } from "fastify";
import type { AgentsManagementApiController } from "../../agents/agents-management-api.controller.js";
import type { BearersManagementApiController } from "../../bearers/bearers-management-api.controller.js";

export interface ManagementRouteControllers {
  agentsManagement: AgentsManagementApiController;
  bearersManagement: BearersManagementApiController;
}

/**
 * Management route group: operator / UI CRUD (NAT-120).
 * Register only management surface here — never JWKS or token exchange.
 */
export function registerManagementRoutes(
  app: FastifyInstance,
  controllers: ManagementRouteControllers,
): void {
  controllers.agentsManagement.registerRoutes(app);
  controllers.bearersManagement.registerRoutes(app);
}
