import { randomUUID } from "node:crypto";
import { toIso, type Pool } from "@keidai/postgres";
import {
  nextRunAtAfterUpdate,
  nextRunAtIso,
  taskSchema,
  type SavedTask,
  type UpdateTaskRequest,
} from "@keidai/shared";
import type {
  ClaimDueTasksInput,
  CreateTaskInput,
  DeferScheduleClaimInput,
  RecordScheduleStartFailureInput,
  RecordScheduleSuccessInput,
  ScheduleStartFailureOutcome,
  TaskRepository,
} from "./types/task-repository.js";
import {
  DEFAULT_DUE_TASK_LIMIT,
  DEFAULT_TASK_LIST_LIMIT,
  MAX_SCHEDULE_START_ATTEMPTS,
} from "./types/task-repository.js";

interface TaskRow {
  id: string;
  goal: string;
  trigger_json: unknown;
  assignee: string;
  limits_json: unknown | null;
  created_at: Date | string;
  updated_at: Date | string;
  archived_at: Date | string | null;
  next_run_at: Date | string | null;
  schedule_failed_at: Date | string | null;
  schedule_error: string | null;
}

function asJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function rowToSavedTask(row: TaskRow): SavedTask {
  const task = taskSchema.parse({
    goal: row.goal,
    trigger: asJson(row.trigger_json),
    assignee: row.assignee,
    limits: row.limits_json == null ? undefined : asJson(row.limits_json),
  });
  return {
    id: row.id,
    ...task,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    nextRunAt: row.next_run_at ? toIso(row.next_run_at) : null,
    ...(row.archived_at ? { archivedAt: toIso(row.archived_at) } : {}),
    ...(row.schedule_failed_at
      ? {
          scheduleFailedAt: toIso(row.schedule_failed_at),
          scheduleError: row.schedule_error ?? undefined,
        }
      : {}),
  };
}

const TASK_COLUMNS = `
  id, goal, trigger_json, assignee, limits_json, created_at, updated_at,
  archived_at, next_run_at, schedule_failed_at, schedule_error
`;

export class PgTaskRepository implements TaskRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateTaskInput): Promise<SavedTask> {
    const now = new Date();
    const nowIso = now.toISOString();
    const id = randomUUID();
    const nextRunAt = nextRunAtIso(input.task.trigger, now);
    await this.pool.query(
      `
        INSERT INTO tasks (
          id, goal, trigger_json, assignee, limits_json, created_at, updated_at,
          archived_at, next_run_at
        ) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, NULL, $8)
      `,
      [
        id,
        input.task.goal,
        JSON.stringify(input.task.trigger),
        input.task.assignee,
        input.task.limits ? JSON.stringify(input.task.limits) : null,
        nowIso,
        nowIso,
        nextRunAt,
      ],
    );
    return {
      id,
      ...input.task,
      createdAt: nowIso,
      updatedAt: nowIso,
      nextRunAt,
    };
  }

  async get(taskId: string): Promise<SavedTask | null> {
    const result = await this.pool.query<TaskRow>(
      `
        SELECT ${TASK_COLUMNS}
        FROM tasks
        WHERE id = $1
      `,
      [taskId],
    );
    const row = result.rows[0];
    return row ? rowToSavedTask(row) : null;
  }

  async list(limit = DEFAULT_TASK_LIST_LIMIT) {
    const result = await this.pool.query<TaskRow>(
      `
        SELECT ${TASK_COLUMNS}
        FROM tasks
        WHERE archived_at IS NULL
        ORDER BY updated_at DESC, id DESC
        LIMIT $1
      `,
      [limit],
    );
    return { tasks: result.rows.map(rowToSavedTask) };
  }

  async update(taskId: string, input: UpdateTaskRequest): Promise<SavedTask | null> {
    const existing = await this.get(taskId);
    if (!existing) {
      return null;
    }

    const merged = taskSchema.parse({
      goal: input.goal ?? existing.goal,
      trigger: input.trigger ?? existing.trigger,
      assignee: input.assignee ?? existing.assignee,
      limits: input.limits === undefined ? existing.limits : input.limits,
    });
    const now = new Date();
    const updatedAt = now.toISOString();
    const cursor = nextRunAtAfterUpdate(
      existing.trigger,
      existing.nextRunAt,
      merged.trigger,
      now,
    );
    await this.pool.query(
      `
        UPDATE tasks
        SET goal = $1,
            trigger_json = $2::jsonb,
            assignee = $3,
            limits_json = $4::jsonb,
            updated_at = $5,
            next_run_at = $6,
            schedule_claim_until = CASE WHEN $7 THEN NULL ELSE schedule_claim_until END,
            schedule_start_attempts = CASE WHEN $7 THEN 0 ELSE schedule_start_attempts END,
            schedule_failed_at = CASE WHEN $7 THEN NULL ELSE schedule_failed_at END,
            schedule_error = CASE WHEN $7 THEN NULL ELSE schedule_error END
        WHERE id = $8
      `,
      [
        merged.goal,
        JSON.stringify(merged.trigger),
        merged.assignee,
        merged.limits ? JSON.stringify(merged.limits) : null,
        updatedAt,
        cursor.nextRunAt,
        cursor.resetScheduleState,
        taskId,
      ],
    );
    const { scheduleFailedAt, scheduleError, ...existingRest } = existing;
    return {
      ...existingRest,
      ...merged,
      updatedAt,
      nextRunAt: cursor.nextRunAt,
      ...(!cursor.resetScheduleState && scheduleFailedAt
        ? { scheduleFailedAt, scheduleError }
        : {}),
    };
  }

  async archive(taskId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.pool.query(
      `
        UPDATE tasks
        SET archived_at = $1,
            updated_at = $2,
            next_run_at = NULL,
            schedule_claim_until = NULL,
            schedule_start_attempts = 0,
            schedule_failed_at = NULL,
            schedule_error = NULL
        WHERE id = $3 AND archived_at IS NULL
      `,
      [now, now, taskId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(taskId: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM tasks WHERE id = $1", [
      taskId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async claimDueTasks(input: ClaimDueTasksInput): Promise<SavedTask[]> {
    const limit = input.limit ?? DEFAULT_DUE_TASK_LIMIT;
    const nowIso = input.now.toISOString();
    const result = await this.pool.query<TaskRow>(
      `
        WITH due AS (
          SELECT id
          FROM tasks
          WHERE next_run_at <= $1::timestamptz
            AND archived_at IS NULL
            AND schedule_failed_at IS NULL
            AND (
              schedule_claim_until IS NULL
              OR schedule_claim_until <= $1::timestamptz
            )
          ORDER BY next_run_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $2
        )
        UPDATE tasks t
        SET schedule_claim_until = $3::timestamptz
        FROM due
        WHERE t.id = due.id
        RETURNING
          t.id, t.goal, t.trigger_json, t.assignee, t.limits_json,
          t.created_at, t.updated_at, t.archived_at, t.next_run_at,
          t.schedule_failed_at, t.schedule_error
      `,
      [nowIso, limit, input.claimUntil.toISOString()],
    );
    return result.rows.map(rowToSavedTask);
  }

  async setNextRunAt(taskId: string, nextRunAt: string | null): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE tasks
        SET next_run_at = $1
        WHERE id = $2
      `,
      [nextRunAt, taskId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async recordScheduleSuccess(
    input: RecordScheduleSuccessInput,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE tasks
        SET next_run_at = $1,
            schedule_claim_until = NULL,
            schedule_start_attempts = 0,
            schedule_failed_at = NULL,
            schedule_error = NULL
        WHERE id = $2 AND archived_at IS NULL
      `,
      [input.nextRunAt, input.taskId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async recordScheduleStartFailure(
    input: RecordScheduleStartFailureInput,
  ): Promise<ScheduleStartFailureOutcome> {
    const result = await this.pool.query<{
      schedule_failed_at: Date | string | null;
    }>(
      `
        UPDATE tasks
        SET schedule_start_attempts = schedule_start_attempts + 1,
            schedule_claim_until = CASE
              WHEN schedule_start_attempts + 1 >= $1 THEN NULL
              ELSE $2::timestamptz
            END,
            next_run_at = CASE
              WHEN schedule_start_attempts + 1 >= $1 THEN NULL
              ELSE next_run_at
            END,
            schedule_failed_at = CASE
              WHEN schedule_start_attempts + 1 >= $1 THEN $3::timestamptz
              ELSE schedule_failed_at
            END,
            schedule_error = CASE
              WHEN schedule_start_attempts + 1 >= $1 THEN $4
              ELSE schedule_error
            END
        WHERE id = $5 AND archived_at IS NULL
        RETURNING schedule_failed_at
      `,
      [
        MAX_SCHEDULE_START_ATTEMPTS,
        input.retryUntil.toISOString(),
        input.now.toISOString(),
        input.error,
        input.taskId,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return "missing";
    }
    return row.schedule_failed_at ? "failed" : "retry";
  }

  async deferScheduleClaim(input: DeferScheduleClaimInput): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE tasks
        SET schedule_claim_until = $1::timestamptz
        WHERE id = $2 AND archived_at IS NULL
      `,
      [input.claimUntil?.toISOString() ?? null, input.taskId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async peekMinNextRunAt(): Promise<string | null> {
    const result = await this.pool.query<{ next_run_at: Date | string | null }>(
      `
        SELECT min(
          CASE
            WHEN schedule_claim_until IS NOT NULL
            THEN GREATEST(next_run_at, schedule_claim_until)
            ELSE next_run_at
          END
        ) AS next_run_at
        FROM tasks
        WHERE next_run_at IS NOT NULL
          AND archived_at IS NULL
          AND schedule_failed_at IS NULL
      `,
    );
    const value = result.rows[0]?.next_run_at ?? null;
    return value ? toIso(value) : null;
  }
}
