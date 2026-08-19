import type { ApprovalRecordStatus, ApprovalRecordView } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ApprovalStoreService } from "./approval-store.service.js";

@injectable()
export class ApprovalReadService {
  constructor(
    @inject(ApprovalStoreService)
    private readonly approvalStore: ApprovalStoreService,
  ) {}

  async getApproval(id: string): Promise<ApprovalRecordView | undefined> {
    const record = await this.approvalStore.getApproval(id);
    if (!record) {
      return undefined;
    }

    return {
      id: record.id,
      agentId: record.agentId,
      ownerId: record.ownerId,
      toolName: record.toolName,
      params: record.params,
      runId: record.runId,
      stepId: record.stepId,
      status: record.status,
      rejectionReason: record.rejectionReason,
      createdAt: new Date(record.createdAt).toISOString(),
      expiresAt: new Date(record.expiresAt).toISOString(),
      decidedAt:
        record.decidedAt === undefined
          ? undefined
          : new Date(record.decidedAt).toISOString(),
    };
  }

  async listApprovals(
    status?: ApprovalRecordStatus,
    limit?: number,
  ): Promise<ApprovalRecordView[]> {
    return this.approvalStore.listApprovals(status, limit);
  }
}
