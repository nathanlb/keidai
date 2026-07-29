import type { FastifyInstance } from "fastify";
import type { AgentDefinitionApiController } from "../../agents/agent-definition-api.controller.js";

export interface AgentRouteControllers {
  agentDefinition: AgentDefinitionApiController;
}

/**
 * Agent-facing route group: token exchange and related runtime APIs.
 * Definition view (NAT-120) lives here; token exchange lands in NAT-119.
 * Register only agent surface here — never JWKS or management CRUD.
 */
export function registerAgentRoutes(
  app: FastifyInstance,
  controllers: AgentRouteControllers,
): void {
  controllers.agentDefinition.registerRoutes(app);
}
