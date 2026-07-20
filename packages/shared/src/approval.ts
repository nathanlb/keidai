export const APPROVAL_REQUIRED_STATUS = "approval_required" as const;
export const APPROVAL_DENIED_STATUS = "approval_denied" as const;

export const APPROVAL_DECIDED_NOTIFICATION_METHOD =
  "notifications/approval_decided" as const;

export type ApprovalDecidedNotificationStatus = Extract<
  ApprovalRecordStatus,
  "approved" | "rejected" | "cancelled"
>;

export interface ApprovalDecidedNotificationParams {
  approval_id: string;
  status: ApprovalDecidedNotificationStatus;
  reason?: string;
}

export const TORII_APPROVAL_ID_ARG = "approval_id" as const;
export const TORII_RUN_ID_ARG = "_torii_run_id" as const;
export const TORII_STEP_ID_ARG = "_torii_step_id" as const;

export interface ApprovalRequiredPayload {
  status: typeof APPROVAL_REQUIRED_STATUS;
  approval_id: string;
}

export interface ApprovalDeniedPayload {
  status: typeof APPROVAL_DENIED_STATUS;
  reason?: string;
}

export type ApprovalRecordStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface ApprovalRecordView {
  id: string;
  agentId: string;
  ownerId: string;
  toolName: string;
  params: Record<string, unknown>;
  /** Opaque correlation ref — Torii stores and echoes only. */
  runId?: string;
  /** Opaque correlation ref — Torii stores and echoes only. */
  stepId?: string;
  status: ApprovalRecordStatus;
  rejectionReason?: string;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
}
