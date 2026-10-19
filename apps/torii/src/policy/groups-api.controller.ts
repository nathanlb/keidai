import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { requestOperator } from "../http/utils/operator-access.js";
import { GroupPolicyManagementService } from "./group-policy-management.service.js";
import {
  createGroupBodySchema,
  updateGroupBodySchema,
} from "./types/group-api.js";
import { GroupPolicyWriteError } from "./types/group-policy-write.js";

@injectable()
export class GroupsApiController {
  constructor(
    @inject(GroupPolicyManagementService)
    private readonly groups: GroupPolicyManagementService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/groups", async (_request, reply) => {
      reply.send({ groups: await this.groups.list() });
    });

    app.get("/api/groups/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const group = await this.groups.get(id);
      if (!group) {
        reply.code(404).send({ error: "group not found" });
        return;
      }
      reply.send({ group });
    });

    app.post("/api/groups", async (request, reply) => {
      const parsed = createGroupBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid group",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        const operator = requestOperator(request);
        const group = await this.groups.create(
          parsed.data,
          operator?.ownerId ?? null,
        );
        reply.code(201).send({ group });
      } catch (error) {
        this.sendWriteError(reply, error);
      }
    });

    app.patch("/api/groups/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateGroupBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid group update",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (parsed.data.name !== undefined) {
        reply.code(400).send({ error: "name is immutable" });
        return;
      }

      if (!(await this.allowGroupMutation(request, reply, id))) {
        return;
      }

      try {
        const group = await this.groups.update(id, parsed.data);
        if (!group) {
          reply.code(404).send({ error: "group not found" });
          return;
        }
        reply.send({ group });
      } catch (error) {
        this.sendWriteError(reply, error);
      }
    });

    app.delete("/api/groups/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await this.allowGroupMutation(request, reply, id))) {
        return;
      }
      if (!(await this.groups.delete(id))) {
        reply.code(404).send({ error: "group not found" });
        return;
      }
      reply.code(204).send();
    });
  }

  private sendWriteError(
    reply: {
      code: (statusCode: number) => { send: (payload: unknown) => void };
    },
    error: unknown,
  ): void {
    if (error instanceof GroupPolicyWriteError) {
      reply.code(error.statusCode).send({ error: error.message });
      return;
    }
    throw error;
  }

  private async allowGroupMutation(
    request: FastifyRequest,
    reply: FastifyReply,
    id: string,
  ): Promise<boolean> {
    const operator = requestOperator(request);
    if (!operator || operator.role === "admin") {
      return true;
    }
    const existing = await this.groups.get(id);
    if (!existing) {
      reply.code(404).send({ error: "group not found" });
      return false;
    }
    if (existing.ownerId !== operator.ownerId) {
      reply.code(403).send({ error: "Forbidden" });
      return false;
    }
    return true;
  }
}
