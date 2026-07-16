import type { TaskLimits, TerminationOutcome, ToriiCallMeta } from "@keidai/shared";
import type { StepAssessment } from "../step-assessment.js";
import type { ConversationEntry } from "./conversation-history.js";

export type { ConversationEntry, StepAssessment };

/** One tool call requested by the model in a step. */
export interface ModelToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/** One model step: optional terminal assessment, narrative text, and tool calls. */
export interface ModelStep {
  text: string;
  toolCalls: ModelToolCall[];
  /** Present only for terminal steps (no Torii tools). Working steps omit this. */
  assessment?: StepAssessment;
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
  /** Drains queued follow-up user messages immediately before each model call. */
  drainPendingUserMessages?: () => ConversationEntry[];
  /** Persists conversation checkpoints after each history mutation. */
  onHistoryChanged?: (history: readonly ConversationEntry[]) => void;
}

export interface TaskLoopStart {
  initialHistory: ConversationEntry[];
  limits: TaskLimits;
}

export interface TaskLoopResult {
  outcome: TerminationOutcome;
  history: ConversationEntry[];
  iterations: number;
}
