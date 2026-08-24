import type { FastifyInstance } from "fastify";
import type { OperatorApiBackends } from "../create-server.js";
import { registerShaidenRunsRoute } from "./runs/runs.route.js";

export interface RegisterUiRoutesOptions {
  backends: OperatorApiBackends;
  bffServiceToken: string | null;
}

/**
 * View-specific BFF routes under `/api/ui/*`. Paths mirror UI routes; handlers
 * aggregate upstream services and return payloads tailored to a single screen.
 *
 * Register before `registerApiProxy` so explicit handlers win over the `/api`
 * Torii catch-all.
 */
export async function registerUiRoutes(
  app: FastifyInstance,
  options: RegisterUiRoutesOptions,
): Promise<void> {
  await registerShaidenRunsRoute(app, options);
}
