import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { isUniqueViolation } from "@keidai/postgres";
import {
  OWNER_REPOSITORY,
  type OwnerRepository,
} from "../owners/types/owner-repository.js";
import {
  createAgentBodySchema,
  updateAgentBodySchema,
  type ManagementAgent,
} from "./types/agent-api.js";
import {
  AGENT_REPOSITORY,
  type AgentRecord,
  type AgentRepository,
} from "./types/agent-repository.js";

@injectable()
export class AgentsManagementApiController {
  constructor(
    @inject(AGENT_REPOSITORY)
    private readonly agents: AgentRepository,
    @inject(OWNER_REPOSITORY)
    private readonly owners: OwnerRepository,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/agents", async (_request, reply) => {
      const agents: ManagementAgent[] = [];
      for (const record of await this.agents.list()) {
        const agent = await this.toManagementAgent(record);
        if (agent) {
          agents.push(agent);
        }
      }
      reply.send({ agents });
    });

    /**
     * Inline slug uniqueness probe for authoring UX. DB still enforces uniqueness
     * on create; this is convenience only.
     */
    app.get("/api/agents/slugs/:slug/availability", async (request, reply) => {
      const { slug } = request.params as { slug: string };
      reply.send({ available: (await this.agents.getBySlug(slug)) === null });
    });

    app.post("/api/agents", async (request, reply) => {
      const parsed = createAgentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid agent",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (!(await this.owners.get(parsed.data.ownerId))) {
        reply.code(400).send({
          error: "unknown ownerId",
          ownerId: parsed.data.ownerId,
        });
        return;
      }

      try {
        const created = await this.agents.create(parsed.data);
        const agent = await this.toManagementAgent(created);
        if (!agent) {
          reply.code(500).send({ error: "agent created without persona" });
          return;
        }
        reply.code(201).send({ agent });
      } catch (error) {
        if (isUniqueViolation(error, "slug")) {
          reply.code(409).send({ error: "agent slug already exists" });
          return;
        }
        if (isUniqueViolation(error, "agents_pkey")) {
          reply.code(409).send({ error: "agent id already exists" });
          return;
        }
        throw error;
      }
    });

    app.get("/api/agents/:agentId", async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      const record = await this.agents.get(agentId);
      const agent = record ? await this.toManagementAgent(record) : null;
      if (!agent) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }
      reply.send({ agent });
    });

    app.get("/api/agents/:agentId/personas", async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      if (!(await this.agents.get(agentId))) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }
      reply.send({ personas: await this.agents.listPersonas(agentId) });
    });

    app.patch("/api/agents/:agentId", async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      const parsed = updateAgentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid agent update",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (parsed.data.slug !== undefined) {
        reply.code(400).send({ error: "slug is immutable" });
        return;
      }
      if (parsed.data.ownerId !== undefined) {
        reply.code(400).send({ error: "ownerId is immutable" });
        return;
      }

      const existing = await this.agents.get(agentId);
      if (!existing) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }

      if (parsed.data.name !== undefined) {
        await this.agents.updateName(agentId, { name: parsed.data.name });
      }
      if (parsed.data.groups !== undefined) {
        await this.agents.updateGroups(agentId, { groups: parsed.data.groups });
      }
      if (parsed.data.persona !== undefined) {
        await this.agents.appendPersona(agentId, parsed.data.persona);
      }

      const updated = await this.agents.get(agentId);
      const agent = updated ? await this.toManagementAgent(updated) : null;
      if (!agent) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }
      reply.send({ agent });
    });

    app.delete("/api/agents/:agentId", async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      if (!(await this.agents.delete(agentId))) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }
      reply.code(204).send();
    });
  }

  private async toManagementAgent(
    record: AgentRecord,
  ): Promise<ManagementAgent | null> {
    const persona = await this.agents.getCurrentPersona(record.id);
    if (!persona) {
      return null;
    }
    return {
      ...record,
      persona: persona.content,
    };
  }
}
