import type { TerminationOutcome } from "../run.js";
import type { Task } from "../task.js";

export type RunStatus = "running" | "completed";

export type RunStepKind =
  | "model"
  | "tool_dispatch"
  | "tool_result"
  | "waiting_approval";

export interface RunStep {
  id: string;
  timestamp: string;
  kind: RunStepKind;
  toolName?: string;
  toolCallId?: string;
  text?: string;
  inputPreview?: string;
  /** Truncated tool output for run-log display (especially errors). */
  outputPreview?: string;
  status?: "ok" | "error" | "approval_required";
  approvalId?: string;
  charCount?: number;
  /** Torii `CallTrace.traceId` for this tool call, when available. */
  traceId?: string;
}

export interface RunListItem {
  id: string;
  taskId: string;
  startedAt: string;
  assignee: string;
  goalPreview: string;
  status: RunStatus;
  outcome?: TerminationOutcome;
  stepCount: number;
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
}

export interface AppendRunStepRequest {
  step: Omit<RunStep, "id"> & { id?: string };
}

export interface CompleteRunRequest {
  outcome: TerminationOutcome;
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
