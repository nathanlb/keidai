import { randomUUID } from "node:crypto";
import {
  ensureWeeklyPartitions,
  isUniqueViolation,
  toIso,
  withTransaction,
  type Pool,
  type Queryable,
} from "@keidai/postgres";
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
  task_snapshot_json: unknown;
  started_at: Date | string;
  assignee: string;
  goal_preview: string;
  status: string;
  outcome_json: unknown | null;
  step_count: number;
  conversation_history_json: unknown | null;
  persona_version: number | null;
  persona: string | null;
}

interface RunStepRow {
  id: string;
  run_id: string;
  timestamp: Date | string;
  kind: string;
  payload_json: unknown;
}

type RunStepPayload = Omit<RunStep, "id" | "timestamp" | "kind">;

function asJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function parseTaskSnapshot(value: unknown): Task {
  return taskSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}

function serializeOutcome(outcome: TerminationOutcome): string {
  return JSON.stringify(outcome);
}

function parseOutcome(value: unknown | null): TerminationOutcome | undefined {
  if (value == null) {
    return undefined;
  }
  return asJson<TerminationOutcome>(value as TerminationOutcome | string);
}

function nowIso(): string {
  return new Date().toISOString();
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
  const payload = asJson<RunStepPayload>(row.payload_json as RunStepPayload | string);
  return {
    id: row.id,
    timestamp: toIso(row.timestamp),
    kind: row.kind as RunStepKind,
    ...payload,
  } as RunStep;
}

function stepPayloadToJson(step: RunStep): string {
  const { id: _id, timestamp: _timestamp, kind: _kind, ...payload } = step;
  return JSON.stringify(payload);
}

const RUN_COLUMNS = `
  id, task_id, task_snapshot_json, started_at, assignee, goal_preview,
  status, outcome_json, step_count, conversation_history_json,
  persona_version, persona
`;

export class PgRunRepository implements RunRepository {
  constructor(
    private readonly pool: Pool,
    private readonly retentionCount = DEFAULT_RUN_RETENTION_COUNT,
  ) {}

  async create(input: CreateRunRequest): Promise<RunReport> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const personaVersion = input.personaVersion ?? null;
    const persona = input.persona ?? null;
    try {
      await this.pool.query(
        `
          INSERT INTO runs (
            id, task_id, task_snapshot_json, started_at, assignee, goal_preview,
            status, outcome_json, step_count, conversation_history_json,
            persona_version, persona, updated_at
          ) VALUES (
            $1, $2, $3::jsonb, $4, $5, $6,
            $7, $8::jsonb, $9, $10::jsonb,
            $11, $12, $13
          )
        `,
        [
          input.id,
          input.taskId,
          JSON.stringify(input.task),
          startedAt,
          input.assignee,
          formatGoalPreview(input.goal),
          "running",
          null,
          0,
          null,
          personaVersion,
          persona,
          startedAt,
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error, "idx_runs_one_running_per_task")) {
        throw new TaskAlreadyRunningError(input.taskId);
      }
      throw error;
    }
    await this.trim();
    return this.rowToRunReport(
      {
        id: input.id,
        task_id: input.taskId,
        task_snapshot_json: input.task,
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

  async appendStep(runId: string, step: RunStep): Promise<RunReport | null> {
    const runRow = await this.getRunRow(runId);
    if (!runRow) {
      return null;
    }

    const normalized = createRunStep(step as Parameters<typeof createRunStep>[0]);
    await this.ensureStepPartition(normalized.timestamp);
    await withTransaction(this.pool, async (client) => {
      await this.insertStep(client, runId, normalized);
      await this.incrementStepCount(client, runId);
    });

    const updatedRow = await this.getRunRow(runId);
    if (!updatedRow) {
      return null;
    }
    const steps = await this.listStepsForRun(runId);
    return this.rowToRunReport(updatedRow, steps);
  }

  async complete(
    runId: string,
    input: CompleteRunRequest,
  ): Promise<RunReport | null> {
    const runRow = await this.getRunRow(runId);
    if (!runRow) {
      return null;
    }

    await this.pool.query(
      `
        UPDATE runs
        SET status = 'completed',
            outcome_json = $1::jsonb,
            mcp_task_id = NULL,
            mcp_task_poll_interval_ms = NULL,
            owner_id = NULL,
            lease_expires_at = NULL,
            updated_at = $2
        WHERE id = $3
      `,
      [serializeOutcome(input.outcome), nowIso(), runId],
    );
    await this.pool.query("DELETE FROM run_follow_ups WHERE run_id = $1", [
      runId,
    ]);

    const updatedRow = await this.getRunRow(runId);
    if (!updatedRow) {
      return null;
    }
    const steps = await this.listStepsForRun(runId);
    return this.rowToRunReport(updatedRow, steps);
  }

  async get(runId: string): Promise<RunReport | null> {
    const runRow = await this.getRunRow(runId);
    if (!runRow) {
      return null;
    }
    return this.rowToRunReport(runRow, await this.listStepsForRun(runId));
  }

  async list(limit = 50) {
    const result = await this.pool.query<RunRow>(
      `
        SELECT ${RUN_COLUMNS}
        FROM runs
        ORDER BY started_at DESC, id DESC
        LIMIT $1
      `,
      [limit],
    );
    const runs = result.rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      startedAt: toIso(row.started_at),
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

  async listRunningRuns(): Promise<RunningRunRef[]> {
    const result = await this.pool.query<{ id: string; task_id: string }>(
      `
        SELECT id, task_id
        FROM runs
        WHERE status = 'running'
        ORDER BY started_at ASC, id ASC
      `,
    );
    return result.rows.map((row) => ({ id: row.id, taskId: row.task_id }));
  }

  async setConversationHistory(
    runId: string,
    history: readonly ConversationEntry[],
  ): Promise<boolean> {
    const runRow = await this.getRunRow(runId);
    if (!runRow) {
      return false;
    }

    await this.pool.query(
      `
        UPDATE runs
        SET conversation_history_json = $1::jsonb
        WHERE id = $2
      `,
      [serializeConversationHistory(history), runId],
    );
    return true;
  }

  async getConversationHistory(
    runId: string,
  ): Promise<ConversationEntry[] | null> {
    const runRow = await this.getRunRow(runId);
    if (!runRow) {
      return null;
    }
    return parseConversationHistory(runRow.conversation_history_json);
  }

  async setParkedMcpTask(
    runId: string,
    parked: Omit<ParkedMcpTask, "runId">,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE runs
        SET mcp_task_id = $1,
            mcp_task_poll_interval_ms = $2,
            updated_at = $3
        WHERE id = $4 AND status = 'running'
      `,
      [parked.mcpTaskId, parked.pollIntervalMs ?? null, nowIso(), runId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async clearParkedMcpTask(runId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE runs
        SET mcp_task_id = NULL,
            mcp_task_poll_interval_ms = NULL,
            updated_at = $1
        WHERE id = $2
      `,
      [nowIso(), runId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getParkedMcpTask(runId: string): Promise<ParkedMcpTask | null> {
    const result = await this.pool.query<{
      id: string;
      mcp_task_id: string;
      mcp_task_poll_interval_ms: number | null;
    }>(
      `
        SELECT id, mcp_task_id, mcp_task_poll_interval_ms
        FROM runs
        WHERE id = $1 AND mcp_task_id IS NOT NULL
      `,
      [runId],
    );
    const row = result.rows[0];
    return row ? parkedMcpTaskFromRow(row) : null;
  }

  async listParkedMcpTasks(): Promise<ParkedMcpTask[]> {
    const result = await this.pool.query<{
      id: string;
      mcp_task_id: string;
      mcp_task_poll_interval_ms: number | null;
    }>(
      `
        SELECT id, mcp_task_id, mcp_task_poll_interval_ms
        FROM runs
        WHERE status = 'running' AND mcp_task_id IS NOT NULL
        ORDER BY started_at ASC, id ASC
      `,
    );
    return result.rows.map(parkedMcpTaskFromRow);
  }

  async listClaimableParkedMcpTasks(nowIsoValue: string): Promise<ParkedMcpTask[]> {
    const result = await this.pool.query<{
      id: string;
      mcp_task_id: string;
      mcp_task_poll_interval_ms: number | null;
    }>(
      `
        SELECT id, mcp_task_id, mcp_task_poll_interval_ms
        FROM runs
        WHERE status = 'running'
          AND mcp_task_id IS NOT NULL
          AND (
            owner_id IS NULL
            OR lease_expires_at IS NULL
            OR lease_expires_at < $1
          )
        ORDER BY started_at ASC, id ASC
      `,
      [nowIsoValue],
    );
    return result.rows.map(parkedMcpTaskFromRow);
  }

  async enqueueParkedFollowUp(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): Promise<boolean> {
    const normalizedStep = userMessageStep.id
      ? userMessageStep
      : createRunStep(userMessageStep as Parameters<typeof createRunStep>[0]);

    await this.ensureStepPartition(normalizedStep.timestamp);
    return withTransaction(this.pool, async (client) => {
      const parked = await client.query<{ mcp_task_id: string }>(
        `
          SELECT mcp_task_id FROM runs
          WHERE id = $1 AND status = 'running' AND mcp_task_id IS NOT NULL
        `,
        [runId],
      );
      if (!parked.rows[0]) {
        return false;
      }

      await client.query(
        `
          INSERT INTO run_follow_ups (id, run_id, text, created_at)
          VALUES ($1, $2, $3, clock_timestamp())
        `,
        [randomUUID(), runId, message],
      );
      await this.insertStep(client, runId, normalizedStep);
      await this.incrementStepCount(client, runId);
      return true;
    });
  }

  async drainParkedFollowUps(runId: string): Promise<ConversationEntry[]> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<{ text: string }>(
        `
          SELECT text FROM run_follow_ups
          WHERE run_id = $1
          ORDER BY created_at ASC, id ASC
        `,
        [runId],
      );
      if (result.rows.length > 0) {
        await client.query("DELETE FROM run_follow_ups WHERE run_id = $1", [
          runId,
        ]);
      }
      return result.rows.map((row) => ({ role: "user" as const, text: row.text }));
    });
  }

  async claimRun(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
    nowIsoValue: string,
  ): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `
          UPDATE runs
          SET owner_id = $1,
              lease_expires_at = $2
          WHERE id = $3
            AND status = 'running'
            AND (
              owner_id IS NULL
              OR lease_expires_at IS NULL
              OR lease_expires_at < $4
            )
        `,
        [ownerId, leaseExpiresAt, runId, nowIsoValue],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async renewRunLease(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE runs
        SET lease_expires_at = $1
        WHERE id = $2
          AND owner_id = $3
          AND status = 'running'
      `,
      [leaseExpiresAt, runId, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async releaseRun(runId: string, ownerId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE runs
        SET owner_id = NULL,
            lease_expires_at = NULL
        WHERE id = $1 AND owner_id = $2
      `,
      [runId, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listRunWatermarks(): Promise<RunUpdateWatermark[]> {
    const result = await this.pool.query<{
      id: string;
      updated_at: Date | string;
    }>(
      `
        SELECT id, COALESCE(updated_at, started_at) AS updated_at
        FROM runs
      `,
    );
    return result.rows.map((row) => ({
      id: row.id,
      updatedAt: toIso(row.updated_at),
    }));
  }

  async beginContinuation(
    runId: string,
    message?: string,
    userMessageStep?: RunStep,
  ): Promise<BeginContinuationResult> {
    const runRow = await this.getRunRow(runId);
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

    const hasMessage = typeof message === "string" && message.length > 0;
    const updatedHistory = hasMessage
      ? appendUserMessageToHistory(history, message)
      : history;
    const normalizedStep =
      hasMessage && userMessageStep
        ? userMessageStep.id
          ? userMessageStep
          : createRunStep(userMessageStep as Parameters<typeof createRunStep>[0])
        : undefined;

    if (normalizedStep) {
      await this.ensureStepPartition(normalizedStep.timestamp);
    }
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `
          UPDATE runs
          SET status = 'running',
              outcome_json = NULL,
              conversation_history_json = $1::jsonb,
              step_count = step_count + $2,
              updated_at = $3
          WHERE id = $4 AND status = 'completed'
        `,
        [
          serializeConversationHistory(updatedHistory),
          normalizedStep ? 1 : 0,
          nowIso(),
          runId,
        ],
      );
      if ((result.rowCount ?? 0) === 0) {
        return { ok: false, reason: "concurrent_continuation" } as const;
      }

      if (normalizedStep) {
        await this.insertStep(client, runId, normalizedStep);
      }
      return { ok: true, history: updatedHistory } as const;
    });
  }

  private async getRunRow(runId: string): Promise<RunRow | undefined> {
    const result = await this.pool.query<RunRow>(
      `
        SELECT ${RUN_COLUMNS}
        FROM runs
        WHERE id = $1
      `,
      [runId],
    );
    return result.rows[0];
  }

  private async listStepsForRun(runId: string): Promise<RunStep[]> {
    const result = await this.pool.query<RunStepRow>(
      `
        SELECT id, run_id, timestamp, kind, payload_json
        FROM run_steps
        WHERE run_id = $1
        ORDER BY timestamp ASC, id ASC
      `,
      [runId],
    );
    return result.rows.map(stepPayloadFromRow);
  }

  private async insertStep(
    queryable: Queryable,
    runId: string,
    step: RunStep,
  ): Promise<void> {
    await queryable.query(
      `
        INSERT INTO run_steps (id, run_id, timestamp, kind, payload_json)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [step.id, runId, step.timestamp, step.kind, stepPayloadToJson(step)],
    );
  }

  private async incrementStepCount(
    queryable: Queryable,
    runId: string,
  ): Promise<void> {
    await queryable.query(
      `UPDATE runs SET step_count = step_count + 1, updated_at = $1 WHERE id = $2`,
      [nowIso(), runId],
    );
  }

  private async ensureStepPartition(timestamp: string): Promise<void> {
    await ensureWeeklyPartitions(this.pool, "run_steps", new Date(timestamp), 0);
  }

  private rowToRunReport(row: RunRow, steps: RunStep[]): RunReport {
    return {
      id: row.id,
      taskId: row.task_id,
      task: parseTaskSnapshot(row.task_snapshot_json),
      startedAt: toIso(row.started_at),
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

  private async trim(): Promise<void> {
    const excess = await this.pool.query<{ id: string }>(
      `
        SELECT id FROM runs
        WHERE status = 'completed'
        ORDER BY started_at DESC, id DESC
        OFFSET $1
      `,
      [this.retentionCount],
    );
    if (excess.rows.length === 0) {
      return;
    }

    for (const row of excess.rows) {
      await this.pool.query("DELETE FROM run_steps WHERE run_id = $1", [row.id]);
      await this.pool.query("DELETE FROM runs WHERE id = $1", [row.id]);
    }
  }
}
