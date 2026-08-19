import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import type { AgentDefinition } from "./types/agent-api.js";
import {
  AGENT_REPOSITORY,
  type AgentRepository,
} from "./types/agent-repository.js";

/**
 * Runtime-facing definition view for Shaiden (NAT-120 / NAT-127).
 * Deliberately omits identity fields (`ownerId`, `groups`).
 */
@injectable()
export class AgentDefinitionApiController {
  constructor(
    @inject(AGENT_REPOSITORY)
    private readonly agents: AgentRepository,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/agents/:agentId", async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      const agent = await this.agents.get(agentId);
      if (!agent) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }

      const persona = await this.agents.getCurrentPersona(agentId);
      if (!persona) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }

      const definition: AgentDefinition = {
        name: agent.name,
        slug: agent.slug,
        persona: persona.content,
        personaVersion: persona.version,
      };
      reply.send(definition);
    });
  }
}
