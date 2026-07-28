import type { FastifyInstance } from "fastify";

/**
 * Public route group: unauthenticated discovery (JWKS in NAT-116).
 * Register only public surface here — never management or token routes.
 */
export function registerPublicRoutes(_app: FastifyInstance): void {
  // Routes land in later stories (NAT-116).
}
