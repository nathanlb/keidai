import { randomUUID } from "node:crypto";
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
  TaskAlreadyRunningError,
  type ParkedMcpTask,
  type RunRepository,
  type RunUpdateWatermark,
  type RunningRunRef,
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
  persona_version: number | null;
  persona: string | null;
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

const BEGIN_IMMEDIATE = "BEGIN IMMEDIATE";
const COMMIT = "COMMIT";
const ROLLBACK = "ROLLBACK";

function nowIso(): string {
  return new Date().toISOString();
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const errcode = (error as { errcode?: number }).errcode;
  const code = (error as { code?: string }).code;
  // SQLITE_CONSTRAINT_UNIQUE = 2067 (not PK / FK / NOT NULL).
  if (errcode === 2067 || code === "SQLITE_CONSTRAINT_UNIQUE") {
    return true;
  }
  return (
    /UNIQUE constraint failed/i.test(error.message) &&
    !/UNIQUE constraint failed: runs\.id/i.test(error.message)
  );
}

function parkedMcpTaskFromRow(row: {
  id: string;
  mcp_task_id: string;
  mcp_task_poll_interval_ms: number | null;
}): ParkedMcpTask {
  return {
    runId: row.id,
    mcpTaskId: row.mcp_task_id,
    ...(row.mcp_task_poll_interval_ms != null
      ? { pollIntervalMs: row.mcp_task_poll_interval_ms }
      : {}),
  };
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
  private readonly setParkedMcpTaskStatement;
  private readonly clearParkedMcpTaskStatement;
  private readonly getParkedMcpTaskStatement;
  private readonly listParkedMcpTasksStatement;
  private readonly listClaimableParkedMcpTasksStatement;
  private readonly getParkedForUpdateStatement;
  private readonly insertFollowUpStatement;
  private readonly listFollowUpsStatement;
  private readonly deleteFollowUpsStatement;
  private readonly claimRunStatement;
  private readonly renewRunLeaseStatement;
  private readonly releaseRunStatement;
  private readonly listRunWatermarksStatement;
  private readonly listRunningRunsStatement;

  constructor(
    private readonly db: DatabaseSync,
    private readonly retentionCount = DEFAULT_RUN_RETENTION_COUNT,
  ) {
    this.insertRunStatement = db.prepare(`
      INSERT INTO runs (
        id, task_id, task_snapshot_json, started_at, assignee, goal_preview,
        status, outcome_json, step_count, conversation_history_json,
        persona_version, persona, updated_at
      ) VALUES (
        @id, @task_id, @task_snapshot_json, @started_at, @assignee, @goal_preview,
        @status, @outcome_json, @step_count, @conversation_history_json,
        @persona_version, @persona, @updated_at
      )
    `);
    this.getRunStatement = db.prepare(`
      SELECT id, task_id, task_snapshot_json, started_at, assignee, goal_preview,
             status, outcome_json, step_count, conversation_history_json,
             persona_version, persona
      FROM runs
      WHERE id = ?
    `);
    this.listRunsStatement = db.prepare(`
      SELECT id, task_id, task_snapshot_json, started_at, assignee, goal_preview,
             status, outcome_json, step_count, conversation_history_json,
             persona_version, persona
      FROM runs
      ORDER BY started_at DESC, id DESC
      LIMIT ?
    `);
    this.updateRunCompleteStatement = db.prepare(`
      UPDATE runs
      SET status = 'completed',
          outcome_json = @outcome_json,
          mcp_task_id = NULL,
          mcp_task_poll_interval_ms = NULL,
          owner_id = NULL,
          lease_expires_at = NULL,
          updated_at = @updated_at
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
          step_count = step_count + 1,
          updated_at = @updated_at
      WHERE id = @id AND status = 'completed'
    `);
    this.incrementStepCountStatement = db.prepare(`
      UPDATE runs SET step_count = step_count + 1, updated_at = ? WHERE id = ?
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
    this.setParkedMcpTaskStatement = db.prepare(`
      UPDATE runs
      SET mcp_task_id = @mcp_task_id,
          mcp_task_poll_interval_ms = @poll_interval_ms,
          updated_at = @updated_at
      WHERE id = @id AND status = 'running'
    `);
    this.clearParkedMcpTaskStatement = db.prepare(`
      UPDATE runs
      SET mcp_task_id = NULL,
          mcp_task_poll_interval_ms = NULL,
          updated_at = ?
      WHERE id = ?
    `);
    this.getParkedMcpTaskStatement = db.prepare(`
      SELECT id, mcp_task_id, mcp_task_poll_interval_ms
      FROM runs
      WHERE id = ? AND mcp_task_id IS NOT NULL
    `);
    this.listParkedMcpTasksStatement = db.prepare(`
      SELECT id, mcp_task_id, mcp_task_poll_interval_ms
      FROM runs
      WHERE status = 'running' AND mcp_task_id IS NOT NULL
      ORDER BY started_at ASC, id ASC
    `);
    this.listClaimableParkedMcpTasksStatement = db.prepare(`
      SELECT id, mcp_task_id, mcp_task_poll_interval_ms
      FROM runs
      WHERE status = 'running'
        AND mcp_task_id IS NOT NULL
        AND (
          owner_id IS NULL
          OR lease_expires_at IS NULL
          OR lease_expires_at < ?
        )
      ORDER BY started_at ASC, id ASC
    `);
    this.getParkedForUpdateStatement = db.prepare(`
      SELECT mcp_task_id FROM runs
      WHERE id = ? AND status = 'running' AND mcp_task_id IS NOT NULL
    `);
    this.insertFollowUpStatement = db.prepare(`
      INSERT INTO run_follow_ups (id, run_id, text, created_at)
      VALUES (@id, @run_id, @text, @created_at)
    `);
    this.listFollowUpsStatement = db.prepare(`
      SELECT text FROM run_follow_ups
      WHERE run_id = ?
      ORDER BY rowid ASC
    `);
    this.deleteFollowUpsStatement = db.prepare(`
      DELETE FROM run_follow_ups WHERE run_id = ?
    `);
    this.claimRunStatement = db.prepare(`
      UPDATE runs
      SET owner_id = @owner_id,
          lease_expires_at = @lease_expires_at
      WHERE id = @id
        AND status = 'running'
        AND (
          owner_id IS NULL
          OR lease_expires_at IS NULL
          OR lease_expires_at < @now
        )
    `);
    this.renewRunLeaseStatement = db.prepare(`
      UPDATE runs
      SET lease_expires_at = @lease_expires_at
      WHERE id = @id
        AND owner_id = @owner_id
        AND status = 'running'
    `);
    this.releaseRunStatement = db.prepare(`
      UPDATE runs
      SET owner_id = NULL,
          lease_expires_at = NULL
      WHERE id = @id AND owner_id = @owner_id
    `);
    this.listRunWatermarksStatement = db.prepare(`
      SELECT id, COALESCE(updated_at, started_at) AS updated_at
      FROM runs
    `);
    this.listRunningRunsStatement = db.prepare(`
      SELECT id, task_id
      FROM runs
      WHERE status = 'running'
      ORDER BY started_at ASC, id ASC
    `);
  }

  create(input: CreateRunRequest): RunReport {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const personaVersion = input.personaVersion ?? null;
    const persona = input.persona ?? null;
    try {
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
        persona_version: personaVersion,
        persona,
        updated_at: startedAt,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new TaskAlreadyRunningError(input.taskId);
      }
      throw error;
    }
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
        persona_version: personaVersion,
        persona,
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
    this.db.exec(BEGIN_IMMEDIATE);
    try {
      this.insertStepStatement.run({
        id: normalized.id,
        run_id: runId,
        timestamp: normalized.timestamp,
        kind: normalized.kind,
        payload_json: stepPayloadToJson(normalized),
      });
      this.incrementStepCountStatement.run(nowIso(), runId);
      this.db.exec(COMMIT);
    } catch (error) {
      this.db.exec(ROLLBACK);
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
      updated_at: nowIso(),
    });
    this.deleteFollowUpsStatement.run(runId);

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
      ...(row.persona_version != null
        ? { personaVersion: row.persona_version }
        : {}),
      ...(row.persona != null ? { persona: row.persona } : {}),
    }));
    return { runs };
  }

  listRunningRuns(): RunningRunRef[] {
    const rows = this.listRunningRunsStatement.all() as Array<{
      id: string;
      task_id: string;
    }>;
    return rows.map((row) => ({ id: row.id, taskId: row.task_id }));
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

  setParkedMcpTask(
    runId: string,
    parked: Omit<ParkedMcpTask, "runId">,
  ): boolean {
    const result = this.setParkedMcpTaskStatement.run({
      id: runId,
      mcp_task_id: parked.mcpTaskId,
      poll_interval_ms: parked.pollIntervalMs ?? null,
      updated_at: nowIso(),
    });
    return result.changes > 0;
  }

  clearParkedMcpTask(runId: string): boolean {
    const result = this.clearParkedMcpTaskStatement.run(nowIso(), runId);
    return result.changes > 0;
  }

  getParkedMcpTask(runId: string): ParkedMcpTask | null {
    const row = this.getParkedMcpTaskStatement.get(runId) as
      | {
          id: string;
          mcp_task_id: string;
          mcp_task_poll_interval_ms: number | null;
        }
      | undefined;
    return row ? parkedMcpTaskFromRow(row) : null;
  }

  listParkedMcpTasks(): ParkedMcpTask[] {
    const rows = this.listParkedMcpTasksStatement.all() as Array<{
      id: string;
      mcp_task_id: string;
      mcp_task_poll_interval_ms: number | null;
    }>;
    return rows.map(parkedMcpTaskFromRow);
  }

  listClaimableParkedMcpTasks(nowIsoValue: string): ParkedMcpTask[] {
    const rows = this.listClaimableParkedMcpTasksStatement.all(
      nowIsoValue,
    ) as Array<{
      id: string;
      mcp_task_id: string;
      mcp_task_poll_interval_ms: number | null;
    }>;
    return rows.map(parkedMcpTaskFromRow);
  }

  enqueueParkedFollowUp(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): boolean {
    const normalizedStep = userMessageStep.id
      ? userMessageStep
      : createRunStep(userMessageStep as Parameters<typeof createRunStep>[0]);

    this.db.exec(BEGIN_IMMEDIATE);
    try {
      const parked = this.getParkedForUpdateStatement.get(runId) as
        | { mcp_task_id: string }
        | undefined;
      if (!parked) {
        this.db.exec(ROLLBACK);
        return false;
      }

      this.insertFollowUpStatement.run({
        id: randomUUID(),
        run_id: runId,
        text: message,
        created_at: nowIso(),
      });
      this.insertStepStatement.run({
        id: normalizedStep.id,
        run_id: runId,
        timestamp: normalizedStep.timestamp,
        kind: normalizedStep.kind,
        payload_json: stepPayloadToJson(normalizedStep),
      });
      this.incrementStepCountStatement.run(nowIso(), runId);
      this.db.exec(COMMIT);
    } catch (error) {
      this.db.exec(ROLLBACK);
      throw error;
    }

    return true;
  }

  drainParkedFollowUps(runId: string): ConversationEntry[] {
    this.db.exec(BEGIN_IMMEDIATE);
    try {
      const rows = this.listFollowUpsStatement.all(runId) as Array<{
        text: string;
      }>;
      if (rows.length > 0) {
        this.deleteFollowUpsStatement.run(runId);
      }
      this.db.exec(COMMIT);
      return rows.map((row) => ({ role: "user" as const, text: row.text }));
    } catch (error) {
      this.db.exec(ROLLBACK);
      throw error;
    }
  }

  claimRun(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
    nowIsoValue: string,
  ): boolean {
    const result = this.claimRunStatement.run({
      id: runId,
      owner_id: ownerId,
      lease_expires_at: leaseExpiresAt,
      now: nowIsoValue,
    });
    return result.changes > 0;
  }

  renewRunLease(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): boolean {
    const result = this.renewRunLeaseStatement.run({
      id: runId,
      owner_id: ownerId,
      lease_expires_at: leaseExpiresAt,
    });
    return result.changes > 0;
  }

  releaseRun(runId: string, ownerId: string): boolean {
    const result = this.releaseRunStatement.run({
      id: runId,
      owner_id: ownerId,
    });
    return result.changes > 0;
  }

  listRunWatermarks(): RunUpdateWatermark[] {
    const rows = this.listRunWatermarksStatement.all() as Array<{
      id: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({ id: row.id, updatedAt: row.updated_at }));
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

    this.db.exec(BEGIN_IMMEDIATE);
    try {
      const result = this.beginContinuationStatement.run({
        id: runId,
        conversation_history_json: serializeConversationHistory(updatedHistory),
        updated_at: nowIso(),
      });
      if (result.changes === 0) {
        this.db.exec(ROLLBACK);
        return { ok: false, reason: "concurrent_continuation" };
      }

      this.insertStepStatement.run({
        id: normalizedStep.id,
        run_id: runId,
        timestamp: normalizedStep.timestamp,
        kind: normalizedStep.kind,
        payload_json: stepPayloadToJson(normalizedStep),
      });
      this.db.exec(COMMIT);
    } catch (error) {
      this.db.exec(ROLLBACK);
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
      ...(row.persona_version != null
        ? { personaVersion: row.persona_version }
        : {}),
      ...(row.persona != null ? { persona: row.persona } : {}),
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
