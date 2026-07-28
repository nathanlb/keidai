import type { FastifyInstance } from "fastify";

/**
 * Agent-facing route group: token exchange and related runtime APIs (NAT-119).
 * Register only agent surface here — never JWKS or management CRUD.
 */
export function registerAgentRoutes(_app: FastifyInstance): void {
  // Routes land in later stories (NAT-119).
}
