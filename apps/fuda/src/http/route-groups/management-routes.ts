import type { FastifyInstance } from "fastify";

/**
 * Management route group: operator / UI CRUD (NAT-120).
 * Register only management surface here — never JWKS or token exchange.
 */
export function registerManagementRoutes(_app: FastifyInstance): void {
  // Routes land in later stories (NAT-120).
}
