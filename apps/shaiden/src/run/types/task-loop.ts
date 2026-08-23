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
  /** Present for terminal steps (no Torii tools). May accompany harness-local tools. */
  assessment?: StepAssessment;
}

/** Result of dispatching one tool call, flattened for the model. */
export interface ToolDispatchResult {
  isError: boolean;
  text: string;
  approvalRequired?: {
    approvalId: string;
    stepId?: string;
    pollIntervalMs?: number;
  };
  approvalDenied?: boolean;
  /**
   * Torii group policy denied the call. Ordinary calls feed this back as an
   * error tool result; post-approval denials terminate as failed(reason).
   */
  policyDenied?: boolean;
  /** Out-of-band Torii metadata from MCP `_meta` (never model-facing). */
  meta?: ToriiCallMeta;
}

export interface ToolDispatchOptions {
  runId?: string;
  stepId?: string;
  /** Cooperative stop signal; in-flight dispatch still runs, result may be dropped. */
  signal?: AbortSignal;
}

export interface ApprovalWaitContext {
  stepId?: string;
  pollIntervalMs?: number;
  call?: ModelToolCall;
}

export interface TaskLoopDeps {
  callModel: (history: ConversationEntry[]) => Promise<ModelStep>;
  dispatchToolCall: (
    call: ModelToolCall,
    options?: ToolDispatchOptions,
  ) => Promise<ToolDispatchResult>;
  /**
   * Parks until a gated tool's MCP task is terminal, then returns that tool
   * result. Wall-clock pause is handled by the task loop.
   */
  waitForApproval?: (
    approvalId: string,
    context?: ApprovalWaitContext,
  ) => Promise<ToolDispatchResult>;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
  /** Drains queued follow-up user messages immediately before each model call. */
  drainPendingUserMessages?: () =>
    | ConversationEntry[]
    | Promise<ConversationEntry[]>;
  /** Persists conversation checkpoints after each history mutation. */
  onHistoryChanged?: (
    history: readonly ConversationEntry[],
  ) => void | Promise<void>;
  /** Cooperative operator stop; checked at loop boundaries and after in-flight tools. */
  stopSignal?: AbortSignal;
}

export interface TaskLoopStart {
  initialHistory: ConversationEntry[];
  limits: TaskLimits;
  /** Durable MCP task handle for a tool call parked when this process died. */
  resumeParkedApproval?: { approvalId: string };
}

export interface TaskLoopResult {
  outcome: TerminationOutcome;
  history: ConversationEntry[];
  iterations: number;
}
