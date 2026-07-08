export const APPROVAL_REQUIRED_STATUS = "approval_required" as const;
export const APPROVAL_DENIED_STATUS = "approval_denied" as const;

export const TORII_APPROVAL_ID_ARG = "approval_id" as const;
export const TORII_RUN_ID_ARG = "_torii_run_id" as const;

export interface ApprovalRequiredPayload {
  status: typeof APPROVAL_REQUIRED_STATUS;
  approval_id: string;
}

export interface ApprovalDeniedPayload {
  status: typeof APPROVAL_DENIED_STATUS;
  reason?: string;
}

export type ApprovalRecordStatus = "pending" | "approved" | "rejected";

export interface ApprovalRecordView {
  id: string;
  agentId: string;
  ownerId: string;
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  status: ApprovalRecordStatus;
  rejectionReason?: string;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
}
