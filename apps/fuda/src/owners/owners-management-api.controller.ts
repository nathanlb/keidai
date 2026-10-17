import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import {
  AGENT_REPOSITORY,
  type AgentRepository,
} from "../agents/types/agent-repository.js";
import {
  deleteOwner,
  OWNER_GRANT_CLEANER,
  type OwnerGrantCleaner,
} from "./delete-owner.js";
import { resolveOrProvisionOwner } from "./resolve-or-provision-owner.js";
import {
  resolveOrProvisionOwnerBodySchema,
  updateOwnerBodySchema,
} from "./types/owner-api.js";
import {
  OWNER_REPOSITORY,
  type OwnerRepository,
} from "./types/owner-repository.js";

@injectable()
export class OwnersManagementApiController {
  constructor(
    @inject(OWNER_REPOSITORY)
    private readonly owners: OwnerRepository,
    @inject(AGENT_REPOSITORY)
    private readonly agents: AgentRepository,
    @inject(OWNER_GRANT_CLEANER, { isOptional: true })
    private readonly grants?: OwnerGrantCleaner,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.post("/api/owners/resolve-or-provision", async (request, reply) => {
      const parsed = resolveOrProvisionOwnerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid owner",
          details: parsed.error.flatten(),
        });
        return;
      }

      const result = await resolveOrProvisionOwner(this.owners, parsed.data);
      if (!result.ok) {
        reply.code(403).send({
          error: "owner disabled",
          ownerId: result.owner.ownerId,
        });
        return;
      }
      reply.send({ owner: result.owner });
    });

    app.get("/api/owners/:ownerId", async (request, reply) => {
      const { ownerId } = request.params as { ownerId: string };
      const owner = await this.owners.get(ownerId);
      if (!owner) {
        reply.code(404).send({ error: "owner not found" });
        return;
      }
      reply.send({ owner });
    });

    app.patch("/api/owners/:ownerId", async (request, reply) => {
      const { ownerId } = request.params as { ownerId: string };
      const parsed = updateOwnerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid owner update",
          details: parsed.error.flatten(),
        });
        return;
      }

      const owner = await this.owners.setStatus(ownerId, parsed.data.status);
      if (!owner) {
        reply.code(404).send({ error: "owner not found" });
        return;
      }
      reply.send({ owner });
    });

    app.delete("/api/owners/:ownerId", async (request, reply) => {
      const { ownerId } = request.params as { ownerId: string };
      try {
        const deleted = await deleteOwner(
          this.owners,
          this.agents,
          ownerId,
          this.grants,
        );
        if (!deleted) {
          reply.code(404).send({ error: "owner not found" });
          return;
        }
        reply.send({ ownerId, ...deleted });
      } catch (error) {
        reply.code(502).send({
          error: "oauth grant cleanup failed",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}
