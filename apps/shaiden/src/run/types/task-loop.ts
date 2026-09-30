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
  /**
   * The gated call was checkpointed and the process should exit. Not a tool
   * result and not a run status.
   */
  hibernated?: boolean;
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
  /**
   * Persist the park and return without polling. The reclaim sweep polls.
   * Resume omits this and waits for the terminal tool result.
   */
  hibernate?: boolean;
}

/** Iterations and active time already consumed by this run. */
export interface RunBudget {
  iterationsUsed: number;
  activeElapsedMs: number;
}

export interface TaskLoopDeps {
  callModel: (history: ConversationEntry[]) => Promise<ModelStep>;
  dispatchToolCall: (
    call: ModelToolCall,
    options?: ToolDispatchOptions,
  ) => Promise<ToolDispatchResult>;
  /**
   * Live parks pass `hibernate` and return immediately. Resume polls until
   * the MCP task is terminal. Active-time pause is handled by the task loop.
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
  /** Persists remaining-budget progress at each checkpoint and on exit. */
  onBudgetChanged?: (budget: RunBudget) => void | Promise<void>;
  /** Cooperative operator stop; checked at loop boundaries and after in-flight tools. */
  stopSignal?: AbortSignal;
}

export interface TaskLoopStart {
  initialHistory: ConversationEntry[];
  limits: TaskLimits;
  /**
   * Budget already consumed. Omitted means a fresh segment (zeros).
   * Lease reclaim and stop/resume pass the stored counters; a follow-up
   * message passes zeros.
   */
  budget?: RunBudget;
  /** Durable MCP task handle for a tool call parked when this process died. */
  resumeParkedApproval?: { approvalId: string };
}

/** In-memory unwind. The run row stays `running` with `mcp_task_id` set. */
export type TaskLoopOutcome = TerminationOutcome | { status: "parked" };

export interface TaskLoopResult {
  outcome: TaskLoopOutcome;
  history: ConversationEntry[];
  iterations: number;
}
