import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { readOperatorContext, type OperatorRole } from "@keidai/shared";
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
  type OwnerRecord,
  type OwnerRepository,
  type OwnerStatus,
} from "./types/owner-repository.js";

const LAST_ADMIN_ERROR = "cannot remove or demote the last active admin";

function denyUnlessAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const operator = readOperatorContext(request.headers);
  if (operator && operator.role !== "admin") {
    reply.code(403).send({ error: "Forbidden" });
    return true;
  }
  return false;
}

function isActiveAdmin(owner: OwnerRecord): boolean {
  return owner.status === "active" && owner.role === "admin";
}

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

    app.get("/api/owners", async (request, reply) => {
      if (denyUnlessAdmin(request, reply)) {
        return;
      }
      reply.send({ owners: await this.owners.list() });
    });

    app.get("/api/owners/:ownerId", async (request, reply) => {
      if (denyUnlessAdmin(request, reply)) {
        return;
      }
      const { ownerId } = request.params as { ownerId: string };
      const owner = await this.owners.get(ownerId);
      if (!owner) {
        reply.code(404).send({ error: "owner not found" });
        return;
      }
      reply.send({ owner });
    });

    app.patch("/api/owners/:ownerId", async (request, reply) => {
      if (denyUnlessAdmin(request, reply)) {
        return;
      }
      const { ownerId } = request.params as { ownerId: string };
      const parsed = updateOwnerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid owner update",
          details: parsed.error.flatten(),
        });
        return;
      }

      const existing = await this.owners.get(ownerId);
      if (!existing) {
        reply.code(404).send({ error: "owner not found" });
        return;
      }

      const nextStatus: OwnerStatus = parsed.data.status ?? existing.status;
      const nextRole: OperatorRole = parsed.data.role ?? existing.role;
      if (
        await this.removesLastActiveAdmin(existing, {
          status: nextStatus,
          role: nextRole,
        })
      ) {
        reply.code(409).send({ error: LAST_ADMIN_ERROR });
        return;
      }

      const owner = await this.owners.update(ownerId, {
        status: nextStatus,
        role: nextRole,
      });
      if (!owner) {
        reply.code(404).send({ error: "owner not found" });
        return;
      }
      reply.send({ owner });
    });

    app.delete("/api/owners/:ownerId", async (request, reply) => {
      if (denyUnlessAdmin(request, reply)) {
        return;
      }
      const { ownerId } = request.params as { ownerId: string };
      const existing = await this.owners.get(ownerId);
      if (!existing) {
        reply.code(404).send({ error: "owner not found" });
        return;
      }
      if (await this.removesLastActiveAdmin(existing, null)) {
        reply.code(409).send({ error: LAST_ADMIN_ERROR });
        return;
      }

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

  private async removesLastActiveAdmin(
    owner: OwnerRecord,
    next: { status: OwnerStatus; role: OperatorRole } | null,
  ): Promise<boolean> {
    if (!isActiveAdmin(owner)) {
      return false;
    }
    if (next && next.status === "active" && next.role === "admin") {
      return false;
    }
    return (await this.owners.countActiveAdmins()) <= 1;
  }
}
