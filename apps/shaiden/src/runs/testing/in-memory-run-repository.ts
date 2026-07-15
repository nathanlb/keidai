import type {
  CompleteRunRequest,
  CreateRunRequest,
  RunReport,
  RunStep,
} from "@keidai/shared";
import type { ConversationEntry } from "../../run/types/conversation-history.js";
import {
  DEFAULT_RUN_RETENTION_COUNT,
  type RunRepository,
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
}

/** Test-only RunRepository. Not durable and not visible across processes. */
export class InMemoryRunRepository implements RunRepository {
  private readonly runs = new Map<string, StoredRun>();
  private readonly retentionCount: number;

  constructor(retentionCount = DEFAULT_RUN_RETENTION_COUNT) {
    this.retentionCount = retentionCount;
  }

  create(input: CreateRunRequest): RunReport {
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
    };
    this.runs.set(run.id, run);
    this.trim();
    return run;
  }

  appendStep(runId: string, step: RunStep): RunReport | null {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }

    const updated: StoredRun = {
      ...run,
      steps: [...run.steps, step],
      stepCount: run.steps.length + 1,
    };
    this.runs.set(runId, updated);
    return updated;
  }

  complete(runId: string, input: CompleteRunRequest): RunReport | null {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }

    const updated: StoredRun = {
      ...run,
      status: "completed",
      outcome: input.outcome,
    };
    this.runs.set(runId, updated);
    return updated;
  }

  get(runId: string): RunReport | null {
    return this.runs.get(runId) ?? null;
  }

  list(limit = 50) {
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
      }));

    return { runs };
  }

  setConversationHistory(
    runId: string,
    history: readonly ConversationEntry[],
  ): boolean {
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

  getConversationHistory(runId: string): ConversationEntry[] | null {
    const run = this.runs.get(runId);
    if (!run?.conversationHistory) {
      return null;
    }
    return [...run.conversationHistory];
  }

  beginContinuation(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): BeginContinuationResult {
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

    const updatedHistory = appendUserMessageToHistory(history, message);
    const updated: StoredRun = {
      ...run,
      status: "running",
      outcome: undefined,
      conversationHistory: updatedHistory,
      steps: [...run.steps, userMessageStep],
      stepCount: run.steps.length + 1,
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
