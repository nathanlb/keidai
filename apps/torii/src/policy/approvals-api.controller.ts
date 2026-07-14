import type { ApprovalRecordStatus } from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { ApprovalReadService } from "./approval-read.service.js";
import { ApprovalStoreService } from "./approval-store.service.js";
import {
  DEFAULT_APPROVAL_LIST_LIMIT,
  MAX_APPROVAL_LIST_LIMIT,
} from "./types/approval-list.js";

function parseStatus(
  request: FastifyRequest,
): ApprovalRecordStatus | undefined {
  const query = request.query as Record<string, string | undefined>;
  const status = query.status;
  if (
    status === "pending" ||
    status === "approved" ||
    status === "rejected" ||
    status === "cancelled"
  ) {
    return status;
  }
  return undefined;
}

function parseApprovalListLimit(request: FastifyRequest): number {
  const query = request.query as Record<string, string | undefined>;
  const parsedLimit = Number(query.limit ?? DEFAULT_APPROVAL_LIST_LIMIT);
  return Number.isFinite(parsedLimit)
    ? Math.min(Math.max(1, parsedLimit), MAX_APPROVAL_LIST_LIMIT)
    : DEFAULT_APPROVAL_LIST_LIMIT;
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
      reply.send(
        this.approvalRead.listApprovals(
          parseStatus(request),
          parseApprovalListLimit(request),
        ),
      );
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

    app.post("/api/approvals/:id/cancel", async (request, reply) => {
      const { id } = request.params as { id: string };
      const approval = this.approvalStore.cancel(id);
      if (!approval) {
        reply.code(404).send({ error: "approval not found or not pending" });
        return;
      }
      reply.send(this.approvalRead.getApproval(id));
    });
  }
}
