import type { CallToolResult } from "@modelcontextprotocol/server";
import {
  APPROVAL_DENIED_STATUS,
  type ApprovalDeniedPayload,
} from "@keidai/shared";

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

export function callToolResultToRecord(
  result: CallToolResult,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
}
