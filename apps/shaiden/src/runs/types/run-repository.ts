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

export interface RunRepository {
  create(input: CreateRunRequest): RunReport;
  appendStep(runId: string, step: RunStep): RunReport | null;
  complete(runId: string, input: CompleteRunRequest): RunReport | null;
  get(runId: string): RunReport | null;
  list(limit?: number): { runs: RunListItem[] };
  setConversationHistory(
    runId: string,
    history: readonly ConversationEntry[],
  ): boolean;
  getConversationHistory(runId: string): ConversationEntry[] | null;
  setParkedMcpTask(
    runId: string,
    parked: Omit<ParkedMcpTask, "runId">,
  ): boolean;
  clearParkedMcpTask(runId: string): boolean;
  getParkedMcpTask(runId: string): ParkedMcpTask | null;
  listParkedMcpTasks(): ParkedMcpTask[];
  beginContinuation(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): BeginContinuationResult;
}
