import type { ApprovalRecordStatus } from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { ApprovalReadService } from "./approval-read.service.js";
import { ApprovalStoreService } from "./approval-store.service.js";

function parseStatus(
  request: FastifyRequest,
): ApprovalRecordStatus | undefined {
  const query = request.query as Record<string, string | undefined>;
  const status = query.status;
  if (status === "pending" || status === "approved" || status === "rejected") {
    return status;
  }
  return undefined;
}

@injectable()
export class ApprovalsApiController {
  constructor(
    @inject(ApprovalReadService)
    private readonly approvalRead: ApprovalReadService,
    @inject(ApprovalStoreService)
    private readonly approvalStore: ApprovalStoreService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/approvals", async (request, reply) => {
      reply.send(this.approvalRead.listApprovals(parseStatus(request)));
    });

    app.get("/api/approvals/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const approval = this.approvalRead.getApproval(id);
      if (!approval) {
        reply.code(404).send({ error: "approval not found" });
        return;
      }
      reply.send(approval);
    });

    app.post("/api/approvals/:id/approve", async (request, reply) => {
      const { id } = request.params as { id: string };
      const approval = this.approvalStore.approve(id);
      if (!approval) {
        reply.code(404).send({ error: "approval not found or not pending" });
        return;
      }
      reply.send(this.approvalRead.getApproval(id));
    });

    app.post("/api/approvals/:id/reject", async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { reason?: string };
      const approval = this.approvalStore.reject(
        id,
        typeof body.reason === "string" ? body.reason : undefined,
      );
      if (!approval) {
        reply.code(404).send({ error: "approval not found or not pending" });
        return;
      }
      reply.send(this.approvalRead.getApproval(id));
    });
  }
}
