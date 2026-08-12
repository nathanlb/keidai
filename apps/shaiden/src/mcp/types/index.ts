import type { ToriiCallMeta } from "@keidai/shared";
import type { ApprovalResumeSignal } from "../../run/approval-resume-signal.js";

export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Result of dispatching one tool call to Torii, flattened for the model. */
export interface ToolCallResult {
  isError: boolean;
  text: string;
  approvalRequired?: { approvalId: string };
  approvalDenied?: boolean;
  policyDenied?: boolean;
  /** Out-of-band Torii metadata from MCP `_meta` (never model-facing). */
  meta?: ToriiCallMeta;
}

/** Supplies the Fuda-minted agent JWT presented to Torii. */
export interface ToriiSessionCredential {
  ensureToken: (options?: { force?: boolean }) => Promise<string>;
}

/**
 * Per-run Torii MCP caller: Torii URL + JWT provider, not a held protocol session.
 * Each list/call is a self-contained request (with a temporary held stream only
 * while waiting on `notifications/approval_decided` until NAT-147).
 */
export interface ToriiSession {
  tools: DiscoveredTool[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ToolCallResult>;
  /** Force a fresh mint (approval resume) before the next tools/call. */
  remintCredentials: () => Promise<void>;
  createApprovalResumeSignal: () => ApprovalResumeSignal;
  close: () => Promise<void>;
}
