import type { ApprovalRecordStatus, ApprovalRecordView } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ApprovalStoreService } from "./approval-store.service.js";

@injectable()
export class ApprovalReadService {
  constructor(
    @inject(ApprovalStoreService)
    private readonly approvalStore: ApprovalStoreService,
  ) {}

  getApproval(id: string): ApprovalRecordView | undefined {
    const record = this.approvalStore.getApproval(id);
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

  listApprovals(status?: ApprovalRecordStatus): ApprovalRecordView[] {
    return this.approvalStore.listApprovals(status);
  }
}
