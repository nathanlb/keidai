import type { ApprovalDecision } from "./types/task-loop.js";
import { pollApprovalDecision } from "../mcp/torii-approval-client.js";

/**
 * Narrow resume-signal seam for parked gated tool calls.
 * v0 implementation polls Torii's approval ledger; a later issue can swap
 * this for the SSE session stream without touching run models or the ledger.
 */
export interface ApprovalResumeSignal {
  waitForDecision(approvalId: string): Promise<ApprovalDecision>;
}

export function createPollingApprovalResumeSignal(
  toriiBaseUrl: string,
  options?: {
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): ApprovalResumeSignal {
  return {
    waitForDecision(approvalId: string) {
      return pollApprovalDecision(toriiBaseUrl, approvalId, options);
    },
  };
}
