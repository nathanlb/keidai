import type { ApprovalRecordStatus } from "@keidai/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { requestOperator } from "../http/utils/operator-access.js";
import { TaskStoreService } from "../tasks/task-store.service.js";
import { McpTaskLookupError } from "../tasks/types/mcp-task.js";
import { ApprovalReadService } from "./approval-read.service.js";
import { ApprovalStoreService } from "./approval-store.service.js";
import {
  DEFAULT_APPROVAL_LIST_LIMIT,
  MAX_APPROVAL_LIST_LIMIT,
} from "./types/approval-list.js";
import {
  callToolResultToRecord,
  toApprovalDeniedToolResult,
} from "./utils/approval-tool-results.js";

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

function approvalVisible(request: FastifyRequest, ownerId: string): boolean {
  const operator = requestOperator(request);
  if (!operator || operator.role === "admin") {
    return true;
  }
  return ownerId === operator.ownerId;
}

@injectable()
export class ApprovalsApiController {
  constructor(
    @inject(ApprovalReadService)
    private readonly approvalRead: ApprovalReadService,
    @inject(ApprovalStoreService)
    private readonly approvalStore: ApprovalStoreService,
    @inject(TaskStoreService)
    private readonly taskStore: TaskStoreService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/approvals", async (request, reply) => {
      const operator = requestOperator(request);
      reply.send(
        await this.approvalRead.listApprovals(
          parseStatus(request),
          parseApprovalListLimit(request),
          operator?.role === "member" ? operator.ownerId : undefined,
        ),
      );
    });

    app.get("/api/approvals/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const approval = await this.approvalRead.getApproval(id);
      if (!approval || !approvalVisible(request, approval.ownerId)) {
        reply.code(404).send({ error: "approval not found" });
        return;
      }
      reply.send(approval);
    });

    app.post("/api/approvals/:id/approve", async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await this.approvalRead.getApproval(id);
      if (!existing) {
        reply.code(404).send({ error: "approval not found or not pending" });
        return;
      }
      const operator = requestOperator(request);
      if (operator && existing.ownerId !== operator.ownerId) {
        reply.code(403).send({
          error: "only the owning operator can approve tool execution",
        });
        return;
      }
      const approval = await this.approvalStore.approve(id);
      if (!approval) {
        reply.code(404).send({ error: "approval not found or not pending" });
        return;
      }
      reply.send(await this.approvalRead.getApproval(id));
    });

    app.post("/api/approvals/:id/reject", async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await this.allowApprovalDecision(request, reply, id))) {
        return;
      }
      const body = (request.body ?? {}) as { reason?: string };
      const approval = await this.approvalStore.reject(
        id,
        typeof body.reason === "string" ? body.reason : undefined,
      );
      if (!approval) {
        reply.code(404).send({ error: "approval not found or not pending" });
        return;
      }
      if (approval.taskId) {
        await this.taskStore.complete(
          approval.taskId,
          callToolResultToRecord(
            toApprovalDeniedToolResult(approval.rejectionReason),
          ),
        );
      }
      reply.send(await this.approvalRead.getApproval(id));
    });

    app.post("/api/approvals/:id/cancel", async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await this.allowApprovalDecision(request, reply, id))) {
        return;
      }
      const approval = await this.approvalStore.cancel(id);
      if (!approval) {
        reply.code(404).send({ error: "approval not found or not pending" });
        return;
      }
      if (approval.taskId) {
        try {
          await this.taskStore.requestCancel(approval.agentId, approval.taskId);
        } catch (error) {
          if (!(error instanceof McpTaskLookupError)) {
            throw error;
          }
        }
      }
      reply.send(await this.approvalRead.getApproval(id));
    });
  }

  private async allowApprovalDecision(
    request: FastifyRequest,
    reply: FastifyReply,
    id: string,
  ): Promise<boolean> {
    const existing = await this.approvalRead.getApproval(id);
    if (!existing) {
      reply.code(404).send({ error: "approval not found or not pending" });
      return false;
    }
    const operator = requestOperator(request);
    if (
      operator &&
      operator.role !== "admin" &&
      existing.ownerId !== operator.ownerId
    ) {
      reply.code(403).send({ error: "Forbidden" });
      return false;
    }
    return true;
  }
}
