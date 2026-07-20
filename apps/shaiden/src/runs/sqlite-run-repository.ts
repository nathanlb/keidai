import type { DatabaseSync } from "node:sqlite";
import {
  taskSchema,
  type CompleteRunRequest,
  type CreateRunRequest,
  type RunReport,
  type RunStep,
  type RunStepKind,
  type Task,
  type TerminationOutcome,
} from "@keidai/shared";
import type { ConversationEntry } from "../run/types/conversation-history.js";
import {
  DEFAULT_RUN_RETENTION_COUNT,
  type RunRepository,
} from "./types/run-repository.js";
import {
  appendUserMessageToHistory,
  isEligibleContinuationOutcome,
  parseConversationHistory,
  serializeConversationHistory,
  type BeginContinuationResult,
} from "./utils/conversation-history.js";
import { formatGoalPreview } from "./utils/format-goal-preview.js";
import { createRunStep } from "./utils/create-run-step.js";

interface RunRow {
  id: string;
  task_id: string;
  task_snapshot_json: string;
  started_at: string;
  assignee: string;
  goal_preview: string;
  status: string;
  outcome_json: string | null;
  step_count: number;
  conversation_history_json: string | null;
}

interface RunStepRow {
  id: string;
  run_id: string;
  timestamp: string;
  kind: string;
  payload_json: string;
}

type RunStepPayload = Omit<RunStep, "id" | "timestamp" | "kind">;

function parseTaskSnapshot(json: string): Task {
  return taskSchema.parse(JSON.parse(json));
}

function serializeOutcome(outcome: TerminationOutcome): string {
  return JSON.stringify(outcome);
}

function parseOutcome(json: string | null): TerminationOutcome | undefined {
  if (!json) {
    return undefined;
  }
  return JSON.parse(json) as TerminationOutcome;
}

function stepPayloadFromRow(row: RunStepRow): RunStep {
  const payload = JSON.parse(row.payload_json) as RunStepPayload;
  return {
    id: row.id,
    timestamp: row.timestamp,
    kind: row.kind as RunStepKind,
    ...payload,
  } as RunStep;
}

function stepPayloadToJson(step: RunStep): string {
  const { id: _id, timestamp: _timestamp, kind: _kind, ...payload } = step;
  return JSON.stringify(payload);
}

export class SqliteRunRepository implements RunRepository {
  private readonly insertRunStatement;
  private readonly getRunStatement;
  private readonly listRunsStatement;
  private readonly updateRunCompleteStatement;
  private readonly updateConversationHistoryStatement;
  private readonly beginContinuationStatement;
  private readonly incrementStepCountStatement;
  private readonly insertStepStatement;
  private readonly listStepsStatement;
  private readonly trimRunsStatement;
  private readonly deleteStepsForRunStatement;
  private readonly deleteRunStatement;

  constructor(
    private readonly db: DatabaseSync,
    private readonly retentionCount = DEFAULT_RUN_RETENTION_COUNT,
  ) {
    this.insertRunStatement = db.prepare(`
      INSERT INTO runs (
        id, task_id, task_snapshot_json, started_at, assignee, goal_preview,
        status, outcome_json, step_count, conversation_history_json
      ) VALUES (
        @id, @task_id, @task_snapshot_json, @started_at, @assignee, @goal_preview,
        @status, @outcome_json, @step_count, @conversation_history_json
      )
    `);
    this.getRunStatement = db.prepare(`
      SELECT id, task_id, task_snapshot_json, started_at, assignee, goal_preview,
             status, outcome_json, step_count, conversation_history_json
      FROM runs
      WHERE id = ?
    `);
    this.listRunsStatement = db.prepare(`
      SELECT id, task_id, task_snapshot_json, started_at, assignee, goal_preview,
             status, outcome_json, step_count, conversation_history_json
      FROM runs
      ORDER BY started_at DESC, id DESC
      LIMIT ?
    `);
    this.updateRunCompleteStatement = db.prepare(`
      UPDATE runs
      SET status = 'completed', outcome_json = @outcome_json
      WHERE id = @id
    `);
    this.updateConversationHistoryStatement = db.prepare(`
      UPDATE runs
      SET conversation_history_json = @conversation_history_json
      WHERE id = @id
    `);
    this.beginContinuationStatement = db.prepare(`
      UPDATE runs
      SET status = 'running',
          outcome_json = NULL,
          conversation_history_json = @conversation_history_json,
          step_count = step_count + 1
      WHERE id = @id AND status = 'completed'
    `);
    this.incrementStepCountStatement = db.prepare(`
      UPDATE runs SET step_count = step_count + 1 WHERE id = ?
    `);
    this.insertStepStatement = db.prepare(`
      INSERT INTO run_steps (id, run_id, timestamp, kind, payload_json)
      VALUES (@id, @run_id, @timestamp, @kind, @payload_json)
    `);
    this.listStepsStatement = db.prepare(`
      SELECT id, run_id, timestamp, kind, payload_json
      FROM run_steps
      WHERE run_id = ?
      ORDER BY timestamp ASC, rowid ASC
    `);
    this.trimRunsStatement = db.prepare(`
      SELECT id FROM runs
      WHERE status = 'completed'
      ORDER BY started_at DESC, id DESC
      LIMIT -1 OFFSET ?
    `);
    this.deleteStepsForRunStatement = db.prepare(`
      DELETE FROM run_steps WHERE run_id = ?
    `);
    this.deleteRunStatement = db.prepare(`DELETE FROM runs WHERE id = ?`);
  }

  create(input: CreateRunRequest): RunReport {
    const startedAt = input.startedAt ?? new Date().toISOString();
    this.insertRunStatement.run({
      id: input.id,
      task_id: input.taskId,
      task_snapshot_json: JSON.stringify(input.task),
      started_at: startedAt,
      assignee: input.assignee,
      goal_preview: formatGoalPreview(input.goal),
      status: "running",
      outcome_json: null,
      step_count: 0,
      conversation_history_json: null,
    });
    this.trim();
    return this.rowToRunReport(
      {
        id: input.id,
        task_id: input.taskId,
        task_snapshot_json: JSON.stringify(input.task),
        started_at: startedAt,
        assignee: input.assignee,
        goal_preview: formatGoalPreview(input.goal),
        status: "running",
        outcome_json: null,
        step_count: 0,
        conversation_history_json: null,
      },
      [],
    );
  }

  appendStep(runId: string, step: RunStep): RunReport | null {
    const runRow = this.getRunStatement.get(runId) as RunRow | undefined;
    if (!runRow) {
      return null;
    }

    const normalized = createRunStep(step as Parameters<typeof createRunStep>[0]);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.insertStepStatement.run({
        id: normalized.id,
        run_id: runId,
        timestamp: normalized.timestamp,
        kind: normalized.kind,
        payload_json: stepPayloadToJson(normalized),
      });
      this.incrementStepCountStatement.run(runId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const updatedRow = this.getRunStatement.get(runId) as unknown as RunRow;
    const steps = this.listStepsForRun(runId);
    return this.rowToRunReport(updatedRow, steps);
  }

  complete(runId: string, input: CompleteRunRequest): RunReport | null {
    const runRow = this.getRunStatement.get(runId) as RunRow | undefined;
    if (!runRow) {
      return null;
    }

    this.updateRunCompleteStatement.run({
      id: runId,
      outcome_json: serializeOutcome(input.outcome),
    });

    const updatedRow = this.getRunStatement.get(runId) as unknown as RunRow;
    const steps = this.listStepsForRun(runId);
    return this.rowToRunReport(updatedRow, steps);
  }

  get(runId: string): RunReport | null {
    const runRow = this.getRunStatement.get(runId) as RunRow | undefined;
    if (!runRow) {
      return null;
    }
    return this.rowToRunReport(runRow, this.listStepsForRun(runId));
  }

  list(limit = 50) {
    const rows = this.listRunsStatement.all(limit) as unknown as RunRow[];
    const runs = rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      startedAt: row.started_at,
      assignee: row.assignee,
      goalPreview: row.goal_preview,
      status: row.status as RunReport["status"],
      outcome: parseOutcome(row.outcome_json),
      stepCount: row.step_count,
    }));
    return { runs };
  }

  setConversationHistory(
    runId: string,
    history: readonly ConversationEntry[],
  ): boolean {
    const runRow = this.getRunStatement.get(runId) as RunRow | undefined;
    if (!runRow) {
      return false;
    }

    this.updateConversationHistoryStatement.run({
      id: runId,
      conversation_history_json: serializeConversationHistory(history),
    });
    return true;
  }

  getConversationHistory(runId: string): ConversationEntry[] | null {
    const runRow = this.getRunStatement.get(runId) as RunRow | undefined;
    if (!runRow) {
      return null;
    }
    return parseConversationHistory(runRow.conversation_history_json);
  }

  beginContinuation(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): BeginContinuationResult {
    const runRow = this.getRunStatement.get(runId) as RunRow | undefined;
    if (!runRow) {
      return { ok: false, reason: "not_found" };
    }

    if (runRow.status !== "completed") {
      return { ok: false, reason: "not_terminal" };
    }

    const outcome = parseOutcome(runRow.outcome_json);
    if (!isEligibleContinuationOutcome(outcome)) {
      return { ok: false, reason: "ineligible_outcome" };
    }

    const history = parseConversationHistory(runRow.conversation_history_json);
    if (!history || history.length === 0) {
      return { ok: false, reason: "missing_history" };
    }

    const updatedHistory = appendUserMessageToHistory(history, message);
    const normalizedStep = userMessageStep.id
      ? userMessageStep
      : createRunStep(userMessageStep as Parameters<typeof createRunStep>[0]);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.beginContinuationStatement.run({
        id: runId,
        conversation_history_json: serializeConversationHistory(updatedHistory),
      });
      if (result.changes === 0) {
        this.db.exec("ROLLBACK");
        return { ok: false, reason: "concurrent_continuation" };
      }

      this.insertStepStatement.run({
        id: normalizedStep.id,
        run_id: runId,
        timestamp: normalizedStep.timestamp,
        kind: normalizedStep.kind,
        payload_json: stepPayloadToJson(normalizedStep),
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return { ok: true, history: updatedHistory };
  }

  private listStepsForRun(runId: string): RunStep[] {
    const rows = this.listStepsStatement.all(runId) as unknown as RunStepRow[];
    return rows.map(stepPayloadFromRow);
  }

  private rowToRunReport(row: RunRow, steps: RunStep[]): RunReport {
    return {
      id: row.id,
      taskId: row.task_id,
      task: parseTaskSnapshot(row.task_snapshot_json),
      startedAt: row.started_at,
      assignee: row.assignee,
      goalPreview: row.goal_preview,
      status: row.status as RunReport["status"],
      outcome: parseOutcome(row.outcome_json),
      stepCount: row.step_count,
      steps,
    };
  }

  private trim(): void {
    const excess = this.trimRunsStatement.all(this.retentionCount) as Array<{
      id: string;
    }>;
    if (excess.length === 0) {
      return;
    }

    for (const row of excess) {
      this.deleteStepsForRunStatement.run(row.id);
      this.deleteRunStatement.run(row.id);
    }
  }
}
