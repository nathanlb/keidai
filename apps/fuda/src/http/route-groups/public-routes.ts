import type { FastifyInstance } from "fastify";
import type { JwksApiController } from "../../signing/jwks-api.controller.js";

export interface PublicRouteControllers {
  jwks: JwksApiController;
}

/**
 * Public route group: unauthenticated discovery (JWKS).
 * Register only public surface here — never management or token routes.
 */
export function registerPublicRoutes(
  app: FastifyInstance,
  controllers: PublicRouteControllers,
): void {
  controllers.jwks.registerRoutes(app);
}
