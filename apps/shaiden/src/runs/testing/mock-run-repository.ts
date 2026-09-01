import type {
  CompleteRunRequest,
  CreateRunRequest,
  RunReport,
  RunStep,
} from "@keidai/shared";
import type { ConversationEntry } from "../../run/types/conversation-history.js";
import {
  DEFAULT_RUN_RETENTION_COUNT,
  TaskAlreadyRunningError,
  type ParkedMcpTask,
  type RunRepository,
  type RunUpdateWatermark,
  type RunningRunRef,
} from "../types/run-repository.js";
import {
  appendUserMessageToHistory,
  isEligibleContinuationOutcome,
  type BeginContinuationResult,
} from "../utils/conversation-history.js";
import { formatGoalPreview } from "../utils/format-goal-preview.js";

function compareRuns(left: RunReport, right: RunReport): number {
  const byTime = right.startedAt.localeCompare(left.startedAt);
  if (byTime !== 0) {
    return byTime;
  }
  return right.id.localeCompare(left.id);
}

interface StoredRun extends RunReport {
  conversationHistory?: ConversationEntry[];
  mcpTaskId?: string;
  mcpTaskPollIntervalMs?: number;
  pendingFollowUps: string[];
  ownerId?: string;
  leaseExpiresAt?: string;
  updatedAt: string;
}

/** @internal Test-only. Not for production use. */
export class MockRunRepository implements RunRepository {
  private readonly runs = new Map<string, StoredRun>();
  private readonly retentionCount: number;

  constructor(retentionCount = DEFAULT_RUN_RETENTION_COUNT) {
    this.retentionCount = retentionCount;
  }

  async create(input: CreateRunRequest): Promise<RunReport> {
    for (const existing of this.runs.values()) {
      if (existing.status === "running" && existing.taskId === input.taskId) {
        throw new TaskAlreadyRunningError(input.taskId);
      }
    }
    const run: StoredRun = {
      id: input.id,
      taskId: input.taskId,
      task: input.task,
      startedAt: input.startedAt ?? new Date().toISOString(),
      assignee: input.assignee,
      goalPreview: formatGoalPreview(input.goal),
      status: "running",
      stepCount: 0,
      steps: [],
      pendingFollowUps: [],
      updatedAt: input.startedAt ?? new Date().toISOString(),
      ...(input.personaVersion !== undefined
        ? { personaVersion: input.personaVersion }
        : {}),
      ...(input.persona !== undefined ? { persona: input.persona } : {}),
    };
    this.runs.set(run.id, run);
    this.trim();
    return run;
  }

  async appendStep(runId: string, step: RunStep): Promise<RunReport | null> {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }

    const updated: StoredRun = {
      ...run,
      steps: [...run.steps, step],
      stepCount: run.steps.length + 1,
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(runId, updated);
    return updated;
  }

  async complete(runId: string, input: CompleteRunRequest): Promise<RunReport | null> {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }

    const updated: StoredRun = {
      ...run,
      status: "completed",
      outcome: input.outcome,
      mcpTaskId: undefined,
      mcpTaskPollIntervalMs: undefined,
      ownerId: undefined,
      leaseExpiresAt: undefined,
      pendingFollowUps: [],
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(runId, updated);
    return updated;
  }

  async get(runId: string): Promise<RunReport | null> {
    return this.runs.get(runId) ?? null;
  }

  async list(limit = 50) {
    const runs = [...this.runs.values()]
      .sort(compareRuns)
      .slice(0, limit)
      .map((run) => ({
        id: run.id,
        taskId: run.taskId,
        startedAt: run.startedAt,
        assignee: run.assignee,
        goalPreview: run.goalPreview,
        status: run.status,
        outcome: run.outcome,
        stepCount: run.steps.length,
        ...(run.personaVersion !== undefined
          ? { personaVersion: run.personaVersion }
          : {}),
        ...(run.persona !== undefined ? { persona: run.persona } : {}),
      }));

    return { runs };
  }

  async listRunningRuns(): Promise<RunningRunRef[]> {
    return [...this.runs.values()]
      .filter((run) => run.status === "running")
      .sort((left, right) => {
        const byTime = left.startedAt.localeCompare(right.startedAt);
        return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
      })
      .map((run) => ({
        id: run.id,
        taskId: run.taskId,
        startedAt: run.startedAt,
      }));
  }

  async setConversationHistory(
    runId: string,
    history: readonly ConversationEntry[],
  ): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run) {
      return false;
    }

    this.runs.set(runId, {
      ...run,
      conversationHistory: [...history],
    });
    return true;
  }

  async getConversationHistory(runId: string): Promise<ConversationEntry[] | null> {
    const run = this.runs.get(runId);
    if (!run?.conversationHistory) {
      return null;
    }
    return [...run.conversationHistory];
  }

  async setParkedMcpTask(
    runId: string,
    parked: Omit<ParkedMcpTask, "runId">,
  ): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.status !== "running") {
      return false;
    }
    this.runs.set(runId, {
      ...run,
      mcpTaskId: parked.mcpTaskId,
      mcpTaskPollIntervalMs: parked.pollIntervalMs,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async clearParkedMcpTask(runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run) {
      return false;
    }
    this.runs.set(runId, {
      ...run,
      mcpTaskId: undefined,
      mcpTaskPollIntervalMs: undefined,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async getParkedMcpTask(runId: string): Promise<ParkedMcpTask | null> {
    const run = this.runs.get(runId);
    if (!run?.mcpTaskId) {
      return null;
    }
    return {
      runId,
      mcpTaskId: run.mcpTaskId,
      ...(run.mcpTaskPollIntervalMs != null
        ? { pollIntervalMs: run.mcpTaskPollIntervalMs }
        : {}),
    };
  }

  async listParkedMcpTasks(): Promise<ParkedMcpTask[]> {
    return [...this.runs.values()]
      .filter((run) => run.status === "running" && Boolean(run.mcpTaskId))
      .sort((left, right) => {
        const byTime = left.startedAt.localeCompare(right.startedAt);
        return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
      })
      .map((run) => ({
        runId: run.id,
        mcpTaskId: run.mcpTaskId as string,
        ...(run.mcpTaskPollIntervalMs != null
          ? { pollIntervalMs: run.mcpTaskPollIntervalMs }
          : {}),
      }));
  }

  async listClaimableParkedMcpTasks(nowIso: string): Promise<ParkedMcpTask[]> {
    return (await this.listParkedMcpTasks()).filter((parked) => {
      const run = this.runs.get(parked.runId);
      if (!run) {
        return false;
      }
      return (
        run.ownerId == null ||
        run.leaseExpiresAt == null ||
        run.leaseExpiresAt < nowIso
      );
    });
  }

  async enqueueParkedFollowUp(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.status !== "running" || !run.mcpTaskId) {
      return false;
    }
    this.runs.set(runId, {
      ...run,
      pendingFollowUps: [...run.pendingFollowUps, message],
      steps: [...run.steps, userMessageStep],
      stepCount: run.steps.length + 1,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async drainParkedFollowUps(runId: string): Promise<ConversationEntry[]> {
    const run = this.runs.get(runId);
    if (!run || run.pendingFollowUps.length === 0) {
      return [];
    }
    const drained = run.pendingFollowUps.map((text) => ({
      role: "user" as const,
      text,
    }));
    this.runs.set(runId, {
      ...run,
      pendingFollowUps: [],
    });
    return drained;
  }

  async claimRun(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
    nowIso: string,
  ): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.status !== "running") {
      return false;
    }
    const claimable =
      run.ownerId == null ||
      run.leaseExpiresAt == null ||
      run.leaseExpiresAt < nowIso;
    if (!claimable) {
      return false;
    }
    this.runs.set(runId, {
      ...run,
      ownerId,
      leaseExpiresAt,
    });
    return true;
  }

  async renewRunLease(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.status !== "running" || run.ownerId !== ownerId) {
      return false;
    }
    this.runs.set(runId, { ...run, leaseExpiresAt });
    return true;
  }

  async releaseRun(runId: string, ownerId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.ownerId !== ownerId) {
      return false;
    }
    this.runs.set(runId, {
      ...run,
      ownerId: undefined,
      leaseExpiresAt: undefined,
    });
    return true;
  }

  async listRunWatermarks(): Promise<RunUpdateWatermark[]> {
    return [...this.runs.values()].map((run) => ({
      id: run.id,
      updatedAt: run.updatedAt,
    }));
  }

  async beginContinuation(
    runId: string,
    message?: string,
    userMessageStep?: RunStep,
  ): Promise<BeginContinuationResult> {
    const run = this.runs.get(runId);
    if (!run) {
      return { ok: false, reason: "not_found" };
    }

    if (run.status !== "completed") {
      return { ok: false, reason: "not_terminal" };
    }

    if (!isEligibleContinuationOutcome(run.outcome)) {
      return { ok: false, reason: "ineligible_outcome" };
    }

    const history = run.conversationHistory;
    if (!history || history.length === 0) {
      return { ok: false, reason: "missing_history" };
    }

    const hasMessage = typeof message === "string" && message.length > 0;
    const updatedHistory = hasMessage
      ? appendUserMessageToHistory(history, message)
      : history;
    const updated: StoredRun = {
      ...run,
      status: "running",
      outcome: undefined,
      conversationHistory: updatedHistory,
      steps:
        hasMessage && userMessageStep
          ? [...run.steps, userMessageStep]
          : run.steps,
      stepCount:
        hasMessage && userMessageStep ? run.steps.length + 1 : run.stepCount,
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(runId, updated);
    return { ok: true, history: updatedHistory };
  }

  private trim(): void {
    const completed = [...this.runs.values()]
      .filter((run) => run.status === "completed")
      .sort(compareRuns);
    if (completed.length <= this.retentionCount) {
      return;
    }

    for (const run of completed.slice(this.retentionCount)) {
      this.runs.delete(run.id);
    }
  }
}
