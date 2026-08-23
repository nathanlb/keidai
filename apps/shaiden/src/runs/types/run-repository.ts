import type {
  CompleteRunRequest,
  CreateRunRequest,
  RunListItem,
  RunReport,
  RunStep,
} from "@keidai/shared";
import type { ConversationEntry } from "../../run/types/conversation-history.js";
import type { BeginContinuationResult } from "../utils/conversation-history.js";

export const DEFAULT_RUN_LIST_LIMIT = 50;
export const MAX_RUN_LIST_LIMIT = 200;
export const DEFAULT_RUN_RETENTION_COUNT = 200;

/** Durable MCP Tasks handle for a run parked on a gated tool call. */
export interface ParkedMcpTask {
  runId: string;
  mcpTaskId: string;
  pollIntervalMs?: number;
}

/** `{id, updatedAt}` watermark used to fan run events across replicas. */
export interface RunUpdateWatermark {
  id: string;
  updatedAt: string;
}

/** In-flight run, used to enforce at most one running row per saved task. */
export interface RunningRunRef {
  id: string;
  taskId: string;
}

/**
 * A second new run was created for a task that already has a `running` row.
 * The durable rule is `UNIQUE(task_id) WHERE status = 'running'`; this error
 * is the HTTP/API mapping when two replicas race `create`.
 */
export class TaskAlreadyRunningError extends Error {
  readonly code = "task_already_running" as const;

  constructor(readonly taskId: string) {
    super("this task already has a running run");
    this.name = "TaskAlreadyRunningError";
  }
}

export interface RunRepository {
  create(input: CreateRunRequest): Promise<RunReport>;
  appendStep(runId: string, step: RunStep): Promise<RunReport | null>;
  complete(runId: string, input: CompleteRunRequest): Promise<RunReport | null>;
  get(runId: string): Promise<RunReport | null>;
  list(limit?: number): Promise<{ runs: RunListItem[] }>;
  listRunningRuns(): Promise<RunningRunRef[]>;
  setConversationHistory(
    runId: string,
    history: readonly ConversationEntry[],
  ): Promise<boolean>;
  getConversationHistory(runId: string): Promise<ConversationEntry[] | null>;
  setParkedMcpTask(
    runId: string,
    parked: Omit<ParkedMcpTask, "runId">,
  ): Promise<boolean>;
  clearParkedMcpTask(runId: string): Promise<boolean>;
  getParkedMcpTask(runId: string): Promise<ParkedMcpTask | null>;
  listParkedMcpTasks(): Promise<ParkedMcpTask[]>;
  /**
   * Parked runs whose lease is missing or expired. Another replica may claim
   * these without double-driving a live owner.
   */
  listClaimableParkedMcpTasks(nowIso: string): Promise<ParkedMcpTask[]>;
  enqueueParkedFollowUp(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): Promise<boolean>;
  drainParkedFollowUps(runId: string): Promise<ConversationEntry[]>;
  claimRun(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
    nowIso: string,
  ): Promise<boolean>;
  renewRunLease(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): Promise<boolean>;
  releaseRun(runId: string, ownerId: string): Promise<boolean>;
  listRunWatermarks(): Promise<RunUpdateWatermark[]>;
  beginContinuation(
    runId: string,
    message?: string,
    userMessageStep?: RunStep,
  ): Promise<BeginContinuationResult>;
}
