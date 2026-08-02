import type { FastifyInstance } from "fastify";
import type { AgentDefinitionApiController } from "../../agents/agent-definition-api.controller.js";
import type { TokenExchangeApiController } from "../../token-exchange/token-exchange-api.controller.js";

export interface AgentRouteControllers {
  agentDefinition: AgentDefinitionApiController;
  tokenExchange: TokenExchangeApiController;
}

/**
 * Agent-facing route group: token exchange and related runtime APIs.
 * Definition view (NAT-120) and token exchange (NAT-119) live here.
 * Register only agent surface here — never JWKS or management CRUD.
 */
export function registerAgentRoutes(
  app: FastifyInstance,
  controllers: AgentRouteControllers,
): void {
  controllers.agentDefinition.registerRoutes(app);
  controllers.tokenExchange.registerRoutes(app);
}
