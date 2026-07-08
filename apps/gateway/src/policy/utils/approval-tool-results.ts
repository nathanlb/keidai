import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  APPROVAL_DENIED_STATUS,
  APPROVAL_REQUIRED_STATUS,
  type ApprovalDeniedPayload,
  type ApprovalRequiredPayload,
} from "@keidai/shared";

export function toApprovalRequiredToolResult(
  approvalId: string,
): CallToolResult {
  const payload: ApprovalRequiredPayload = {
    status: APPROVAL_REQUIRED_STATUS,
    approval_id: approvalId,
  };

  return {
    isError: false,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: { ...payload },
  };
}

export function toApprovalDeniedToolResult(reason?: string): CallToolResult {
  const payload: ApprovalDeniedPayload = {
    status: APPROVAL_DENIED_STATUS,
    ...(reason ? { reason } : {}),
  };

  return {
    isError: false,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: { ...payload },
  };
}
