import type { TerminationOutcome } from "../run.js";
import type { Task } from "../task.js";

export type RunStatus = "running" | "completed";

export type RunStepKind =
  | "model"
  | "output"
  | "tool_dispatch"
  | "tool_result"
  | "waiting_approval"
  | "user_message"
  | "outcome";

interface RunStepBase {
  id: string;
  timestamp: string;
}

export interface ModelRunStep extends RunStepBase {
  kind: "model";
  text?: string;
}

/** In-band task deliverable text for the operator (not reasoning, not outcome). */
export interface OutputRunStep extends RunStepBase {
  kind: "output";
  text: string;
}

export interface ToolDispatchRunStep extends RunStepBase {
  kind: "tool_dispatch";
  toolName?: string;
  toolCallId?: string;
  inputPreview?: string;
}

export interface ToolResultRunStep extends RunStepBase {
  kind: "tool_result";
  toolName?: string;
  toolCallId?: string;
  /** Truncated tool output for run-log display (especially errors). */
  outputPreview?: string;
  status?: "ok" | "error" | "approval_required";
  charCount?: number;
  /** Torii `CallTrace.traceId` for this tool call, when available. */
  traceId?: string;
}

export interface WaitingApprovalRunStep extends RunStepBase {
  kind: "waiting_approval";
  toolName?: string;
  approvalId?: string;
  inputPreview?: string;
}

export interface UserMessageRunStep extends RunStepBase {
  kind: "user_message";
  text: string;
}

export interface OutcomeRunStep extends RunStepBase {
  kind: "outcome";
  outcomeStatus: TerminationOutcome["status"];
  outcomeReason?: string;
}

export type RunStep =
  | ModelRunStep
  | OutputRunStep
  | ToolDispatchRunStep
  | ToolResultRunStep
  | WaitingApprovalRunStep
  | UserMessageRunStep
  | OutcomeRunStep;

export interface RunListItem {
  id: string;
  taskId: string;
  startedAt: string;
  assignee: string;
  goalPreview: string;
  status: RunStatus;
  outcome?: TerminationOutcome;
  stepCount: number;
  /**
   * Persona version fetched from Fuda at this run's start. Immutable for the
   * life of the run so traces resolve to the exact persona that produced them.
   */
  personaVersion?: number;
  /**
   * Persona content stamped with `personaVersion` at run start. Resume and
   * mid-flight continuation reuse this without re-fetching from Fuda.
   */
  persona?: string;
}

export interface RunReport extends RunListItem {
  task: Task;
  steps: RunStep[];
}

export interface RunsResponse {
  runs: RunListItem[];
}

export interface CreateRunRequest {
  id: string;
  taskId: string;
  task: Task;
  assignee: string;
  goal: string;
  startedAt?: string;
  personaVersion?: number;
  persona?: string;
}

export interface AppendRunStepRequest {
  step: Omit<RunStep, "id"> & { id?: string };
}

export interface CompleteRunRequest {
  outcome: TerminationOutcome;
}

export const FOLLOW_UP_MESSAGE_MAX_LENGTH = 10_000;

export interface FollowUpRunRequest {
  message: string;
}

export interface FollowUpRunResponse {
  runId: string;
}

/** SSE `event:` names on `GET /api/runs/events`. */
export const RUN_SSE_EVENT = {
  runUpdated: "run_updated",
} as const;

export type RunSseEventType =
  (typeof RUN_SSE_EVENT)[keyof typeof RUN_SSE_EVENT];

export type RunSseEvent = {
  type: typeof RUN_SSE_EVENT.runUpdated;
  run: RunReport;
};

export interface RunSseEventData {
  [RUN_SSE_EVENT.runUpdated]: RunReport;
}
