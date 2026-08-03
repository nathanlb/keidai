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

export interface ToriiSession {
  tools: DiscoveredTool[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ToolCallResult>;
  /** Force a fresh mint (approval resume) and update the session Authorization header. */
  remintCredentials: () => Promise<void>;
  createApprovalResumeSignal: () => ApprovalResumeSignal;
  close: () => Promise<void>;
}
