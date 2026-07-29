import type { FastifyInstance } from "fastify";
import type { RouteGroup } from "../types/route-group.js";
import type { AgentRouteControllers } from "../route-groups/agent-routes.js";
import { registerAgentRoutes } from "../route-groups/agent-routes.js";
import type { ManagementRouteControllers } from "../route-groups/management-routes.js";
import { registerManagementRoutes } from "../route-groups/management-routes.js";
import { registerPublicRoutes } from "../route-groups/public-routes.js";

export type FudaRouteControllers = AgentRouteControllers &
  ManagementRouteControllers;

export type RouteGroupRegistrar = (
  app: FastifyInstance,
  controllers: FudaRouteControllers,
) => void;

export const ROUTE_GROUP_REGISTRARS: Record<RouteGroup, RouteGroupRegistrar> = {
  public: (app) => {
    registerPublicRoutes(app);
  },
  agent: (app, controllers) => {
    registerAgentRoutes(app, controllers);
  },
  management: (app, controllers) => {
    registerManagementRoutes(app, controllers);
  },
};

/** Registers only the requested route groups onto a Fastify instance. */
export function registerRouteGroups(
  app: FastifyInstance,
  groups: readonly RouteGroup[],
  controllers: FudaRouteControllers,
  registrars: Record<RouteGroup, RouteGroupRegistrar> = ROUTE_GROUP_REGISTRARS,
): void {
  for (const group of groups) {
    registrars[group](app, controllers);
  }
}
