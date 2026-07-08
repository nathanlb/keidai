import {
  APPROVAL_DENIED_STATUS,
  APPROVAL_REQUIRED_STATUS,
  type ApprovalDeniedPayload,
  type ApprovalRequiredPayload,
} from "@keidai/shared";
import type { ToolCallResult } from "./types/index.js";

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isApprovalRequiredPayload(
  value: unknown,
): value is ApprovalRequiredPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === APPROVAL_REQUIRED_STATUS &&
    "approval_id" in value &&
    typeof value.approval_id === "string"
  );
}

function isApprovalDeniedPayload(
  value: unknown,
): value is ApprovalDeniedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === APPROVAL_DENIED_STATUS
  );
}

export function enrichToolCallResult(
  isError: boolean,
  text: string,
): ToolCallResult {
  const parsed = tryParseJson(text);
  if (isApprovalRequiredPayload(parsed)) {
    return {
      isError: false,
      text,
      approvalRequired: { approvalId: parsed.approval_id },
    };
  }

  if (isApprovalDeniedPayload(parsed)) {
    return {
      isError: false,
      text: formatApprovalDeniedForModel(parsed),
      approvalDenied: true,
    };
  }

  return { isError, text };
}

export function formatApprovalDeniedForModel(
  payload: ApprovalDeniedPayload,
): string {
  if (payload.reason) {
    return `Human review denied this tool call. Reason: ${payload.reason}. This denial is authoritative — do not retry this call or attempt the same action through a different tool.`;
  }

  return "Human review denied this tool call. This denial is authoritative — do not retry this call or attempt the same action through a different tool.";
}

export const HUMAN_REJECT_PREFIX = "HUMAN_REJECT:";

export function isHumanRejectResponse(text: string): boolean {
  return text.trimStart().startsWith(HUMAN_REJECT_PREFIX);
}
