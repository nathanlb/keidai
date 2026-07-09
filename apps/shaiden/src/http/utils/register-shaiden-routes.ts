import type { FastifyInstance } from "fastify";
import type { RunsApiController } from "../runs-api.controller.js";

export interface ShaidenRouteControllers {
  runsApi: RunsApiController;
}

/** Composes HTTP route controllers onto a shared Fastify instance. */
export function registerShaidenRoutes(
  app: FastifyInstance,
  controllers: ShaidenRouteControllers,
): void {
  controllers.runsApi.registerRoutes(app);
}
