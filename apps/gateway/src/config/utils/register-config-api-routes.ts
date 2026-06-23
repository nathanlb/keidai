import type { FastifyInstance } from "fastify";
import type { ConfigReadService } from "../config-read.service.js";

export function registerConfigApiRoutes(
  app: FastifyInstance,
  configRead: ConfigReadService,
): void {
  app.get("/api/config/servers", async (_request, reply) => {
    reply.send(configRead.listServers());
  });

  app.get("/api/config/oauth-providers", async (_request, reply) => {
    reply.send(configRead.listOAuthProviders());
  });

  app.get("/api/config/agents", async (_request, reply) => {
    reply.send(configRead.listAgents());
  });
}
