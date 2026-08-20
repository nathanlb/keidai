import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { isForeignKeyViolation, isUniqueViolation } from "@keidai/postgres";
import {
  AGENT_REPOSITORY,
  type AgentRepository,
} from "../agents/types/agent-repository.js";
import { PLATFORM_BEARER_ID } from "./platform-bearer.js";
import {
  createBearerBodySchema,
  createGrantBodySchema,
  updateBearerBodySchema,
} from "./types/bearer-api.js";
import {
  BEARER_REPOSITORY,
  type BearerRepository,
} from "./types/bearer-repository.js";

@injectable()
export class BearersManagementApiController {
  constructor(
    @inject(BEARER_REPOSITORY)
    private readonly bearers: BearerRepository,
    @inject(AGENT_REPOSITORY)
    private readonly agents: AgentRepository,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/bearers", async (_request, reply) => {
      reply.send({ bearers: await this.bearers.list() });
    });

    app.post("/api/bearers", async (request, reply) => {
      const parsed = createBearerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid bearer",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        const bearer = await this.bearers.create(parsed.data);
        reply.code(201).send({ bearer });
      } catch (error) {
        if (isUniqueViolation(error, "bearer_id")) {
          reply.code(409).send({ error: "bearer already exists" });
          return;
        }
        throw error;
      }
    });

    app.get("/api/bearers/:bearerId", async (request, reply) => {
      const { bearerId } = request.params as { bearerId: string };
      const bearer = await this.bearers.get(bearerId);
      if (!bearer) {
        reply.code(404).send({ error: "bearer not found" });
        return;
      }
      reply.send({
        bearer,
        grants: await this.bearers.listGrantsForBearer(bearerId),
      });
    });

    app.patch("/api/bearers/:bearerId", async (request, reply) => {
      const { bearerId } = request.params as { bearerId: string };
      const parsed = updateBearerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid bearer update",
          details: parsed.error.flatten(),
        });
        return;
      }

      const bearer = await this.bearers.updateDisplayName(
        bearerId,
        parsed.data.displayName,
      );
      if (!bearer) {
        reply.code(404).send({ error: "bearer not found" });
        return;
      }
      reply.send({ bearer });
    });

    app.delete("/api/bearers/:bearerId", async (request, reply) => {
      const { bearerId } = request.params as { bearerId: string };
      if (bearerId === PLATFORM_BEARER_ID) {
        reply.code(409).send({ error: "platform bearer cannot be deleted" });
        return;
      }
      if (!(await this.bearers.delete(bearerId))) {
        reply.code(404).send({ error: "bearer not found" });
        return;
      }
      reply.code(204).send();
    });

    app.post("/api/bearers/:bearerId/grants", async (request, reply) => {
      const { bearerId } = request.params as { bearerId: string };
      const parsed = createGrantBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid grant",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (!(await this.bearers.get(bearerId))) {
        reply.code(404).send({ error: "bearer not found" });
        return;
      }
      if (!(await this.agents.get(parsed.data.agentId))) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }

      try {
        const grant = await this.bearers.grant(bearerId, parsed.data.agentId);
        reply.code(201).send({ grant });
      } catch (error) {
        if (isUniqueViolation(error)) {
          reply.code(409).send({ error: "grant already exists" });
          return;
        }
        if (isForeignKeyViolation(error)) {
          reply.code(404).send({ error: "agent not found" });
          return;
        }
        throw error;
      }
    });

    app.delete(
      "/api/bearers/:bearerId/grants/:agentId",
      async (request, reply) => {
        const { bearerId, agentId } = request.params as {
          bearerId: string;
          agentId: string;
        };
        if (!(await this.bearers.get(bearerId))) {
          reply.code(404).send({ error: "bearer not found" });
          return;
        }
        if (!(await this.bearers.revoke(bearerId, agentId))) {
          reply.code(404).send({ error: "grant not found" });
          return;
        }
        reply.code(204).send();
      },
    );

    app.get("/api/agents/:agentId/grants", async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      if (!(await this.agents.get(agentId))) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }
      reply.send({ grants: await this.bearers.listGrantsForAgent(agentId) });
    });
  }
}
