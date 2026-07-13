import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { ConfigReadService } from "./config-read.service.js";

@injectable()
export class ConfigApiController {
  constructor(
    @inject(ConfigReadService)
    private readonly configRead: ConfigReadService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/config/servers", async (_request, reply) => {
      reply.send(this.configRead.listServers());
    });

    app.get("/api/config/oauth-providers", async (_request, reply) => {
      reply.send(this.configRead.listOAuthProviders());
    });

    app.get("/api/config/agents", async (_request, reply) => {
      reply.send(this.configRead.listAgents());
    });
  }
}
