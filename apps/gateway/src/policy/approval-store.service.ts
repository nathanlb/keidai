import { randomUUID } from "node:crypto";
import type {
  AgentPrincipal,
  ApprovalRecordStatus,
  ApprovalRecordView,
} from "@keidai/shared";
import { injectable } from "tsyringe";

const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const REJECTION_SUPPRESSION_TTL_MS = 60 * 60 * 1000;

interface ApprovalRecord {
  id: string;
  agentId: string;
  ownerId: string;
  toolName: string;
  params: Record<string, unknown>;
  paramsHash: string;
  /** Opaque correlation ref — Torii stores and echoes only. */
  runId?: string;
  /** Opaque correlation ref — Torii stores and echoes only. */
  stepId?: string;
  status: ApprovalRecordStatus;
  rejectionReason?: string;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  usedAt?: number;
}

interface RejectedParamsEntry {
  agentId: string;
  toolName: string;
  paramsHash: string;
  rejectionReason?: string;
  rejectedAt: number;
}

@injectable()
export class ApprovalStoreService {
  private readonly approvals = new Map<string, ApprovalRecord>();
  private readonly recentRejections: RejectedParamsEntry[] = [];

  createPendingApproval(input: {
    principal: AgentPrincipal;
    toolName: string;
    params: Record<string, unknown>;
    paramsHash: string;
    runId?: string;
    stepId?: string;
    now?: number;
    ttlMs?: number;
  }): ApprovalRecord {
    const now = input.now ?? Date.now();
    const record: ApprovalRecord = {
      id: randomUUID(),
      agentId: input.principal.agentId,
      ownerId: input.principal.ownerId,
      toolName: input.toolName,
      params: input.params,
      paramsHash: input.paramsHash,
      runId: input.runId,
      stepId: input.stepId,
      status: "pending",
      createdAt: now,
      expiresAt: now + (input.ttlMs ?? DEFAULT_APPROVAL_TTL_MS),
    };

    this.approvals.set(record.id, record);
    return record;
  }

  getApproval(id: string): ApprovalRecord | undefined {
    return this.approvals.get(id);
  }

  listApprovals(status?: ApprovalRecordStatus): ApprovalRecordView[] {
    const records = [...this.approvals.values()];
    return records
      .filter((record) => (status ? record.status === status : true))
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((record) => toApprovalView(record));
  }

  approve(id: string, now = Date.now()): ApprovalRecord | undefined {
    const record = this.approvals.get(id);
    if (!record || record.status !== "pending" || record.expiresAt <= now) {
      return undefined;
    }

    record.status = "approved";
    record.decidedAt = now;
    return record;
  }

  reject(
    id: string,
    reason: string | undefined,
    now = Date.now(),
  ): ApprovalRecord | undefined {
    const record = this.approvals.get(id);
    if (!record || record.status !== "pending" || record.expiresAt <= now) {
      return undefined;
    }

    record.status = "rejected";
    record.rejectionReason = reason;
    record.decidedAt = now;
    this.recentRejections.push({
      agentId: record.agentId,
      toolName: record.toolName,
      paramsHash: record.paramsHash,
      rejectionReason: reason,
      rejectedAt: now,
    });
    this.pruneRejections(now);
    return record;
  }

  cancel(id: string, now = Date.now()): ApprovalRecord | undefined {
    const record = this.approvals.get(id);
    if (!record || record.status !== "pending" || record.expiresAt <= now) {
      return undefined;
    }

    record.status = "cancelled";
    record.decidedAt = now;
    return record;
  }

  markUsed(id: string, now = Date.now()): ApprovalRecord | undefined {
    const record = this.approvals.get(id);
    if (!record) {
      return undefined;
    }

    record.usedAt = now;
    return record;
  }

  findRecentRejection(input: {
    agentId: string;
    toolName: string;
    paramsHash: string;
    now?: number;
  }): RejectedParamsEntry | undefined {
    const now = input.now ?? Date.now();
    this.pruneRejections(now);

    return this.recentRejections.find(
      (entry) =>
        entry.agentId === input.agentId &&
        entry.toolName === input.toolName &&
        entry.paramsHash === input.paramsHash,
    );
  }

  private pruneRejections(now: number): void {
    const cutoff = now - REJECTION_SUPPRESSION_TTL_MS;
    for (let index = this.recentRejections.length - 1; index >= 0; index--) {
      if (this.recentRejections[index]!.rejectedAt < cutoff) {
        this.recentRejections.splice(index, 1);
      }
    }
  }
}

function toApprovalView(record: ApprovalRecord): ApprovalRecordView {
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
