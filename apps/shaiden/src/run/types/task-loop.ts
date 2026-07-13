import type { TerminationOutcome, ToriiCallMeta } from "@keidai/shared";

/** One tool call requested by the model in a step. */
export interface ModelToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/** One model step: final text, or one or more tool calls to dispatch. */
export interface ModelStep {
  text: string;
  toolCalls: ModelToolCall[];
}

/** Result of dispatching one tool call, flattened for the model. */
export interface ToolDispatchResult {
  isError: boolean;
  text: string;
  approvalRequired?: { approvalId: string; stepId?: string };
  approvalDenied?: boolean;
  /** Out-of-band Torii metadata from MCP `_meta` (never model-facing). */
  meta?: ToriiCallMeta;
}

export interface ToolDispatchOptions {
  approvalId?: string;
  runId?: string;
  stepId?: string;
}

export interface ApprovalDecision {
  status: "approved" | "rejected" | "cancelled";
  reason?: string;
}

export interface ApprovalWaitContext {
  stepId?: string;
}

/**
 * Provider-agnostic conversation history, held in memory for a single run.
 * The model adapter maps entries to its own message format.
 */
export type ConversationEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ModelToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; output: string };

export interface TaskLoopDeps {
  callModel: (history: ConversationEntry[]) => Promise<ModelStep>;
  dispatchToolCall: (
    call: ModelToolCall,
    options?: ToolDispatchOptions,
  ) => Promise<ToolDispatchResult>;
  /** Blocks while Torii holds a pending approval; wall-clock pause is handled here. */
  waitForApproval?: (
    approvalId: string,
    context?: ApprovalWaitContext,
  ) => Promise<ApprovalDecision>;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
}

export interface TaskLoopResult {
  outcome: TerminationOutcome;
  history: ConversationEntry[];
  iterations: number;
}
