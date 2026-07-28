import type { FastifyInstance } from "fastify";
import type { RouteGroup } from "../types/route-group.js";
import { registerAgentRoutes } from "../route-groups/agent-routes.js";
import { registerManagementRoutes } from "../route-groups/management-routes.js";
import { registerPublicRoutes } from "../route-groups/public-routes.js";

export type RouteGroupRegistrar = (app: FastifyInstance) => void;

export const ROUTE_GROUP_REGISTRARS: Record<RouteGroup, RouteGroupRegistrar> = {
  public: registerPublicRoutes,
  agent: registerAgentRoutes,
  management: registerManagementRoutes,
};

/** Registers only the requested route groups onto a Fastify instance. */
export function registerRouteGroups(
  app: FastifyInstance,
  groups: readonly RouteGroup[],
  registrars: Record<RouteGroup, RouteGroupRegistrar> = ROUTE_GROUP_REGISTRARS,
): void {
  for (const group of groups) {
    registrars[group](app);
  }
}
