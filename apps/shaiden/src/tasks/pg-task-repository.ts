import { randomUUID } from "node:crypto";
import { toIso, type Pool } from "@keidai/postgres";
import {
  taskSchema,
  type SavedTask,
  type UpdateTaskRequest,
} from "@keidai/shared";
import type { CreateTaskInput, TaskRepository } from "./types/task-repository.js";
import { DEFAULT_TASK_LIST_LIMIT } from "./types/task-repository.js";

interface TaskRow {
  id: string;
  goal: string;
  trigger_json: unknown;
  assignee: string;
  limits_json: unknown | null;
  created_at: Date | string;
  updated_at: Date | string;
  archived_at: Date | string | null;
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
    ...(row.archived_at ? { archivedAt: toIso(row.archived_at) } : {}),
  };
}

const TASK_COLUMNS = `
  id, goal, trigger_json, assignee, limits_json, created_at, updated_at, archived_at
`;

export class PgTaskRepository implements TaskRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateTaskInput): Promise<SavedTask> {
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.pool.query(
      `
        INSERT INTO tasks (
          id, goal, trigger_json, assignee, limits_json, created_at, updated_at, archived_at
        ) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, NULL)
      `,
      [
        id,
        input.task.goal,
        JSON.stringify(input.task.trigger),
        input.task.assignee,
        input.task.limits ? JSON.stringify(input.task.limits) : null,
        now,
        now,
      ],
    );
    return {
      id,
      ...input.task,
      createdAt: now,
      updatedAt: now,
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
    const updatedAt = new Date().toISOString();
    await this.pool.query(
      `
        UPDATE tasks
        SET goal = $1,
            trigger_json = $2::jsonb,
            assignee = $3,
            limits_json = $4::jsonb,
            updated_at = $5
        WHERE id = $6
      `,
      [
        merged.goal,
        JSON.stringify(merged.trigger),
        merged.assignee,
        merged.limits ? JSON.stringify(merged.limits) : null,
        updatedAt,
        taskId,
      ],
    );
    return {
      ...existing,
      ...merged,
      updatedAt,
    };
  }

  async archive(taskId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.pool.query(
      `
        UPDATE tasks
        SET archived_at = $1,
            updated_at = $2
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
}
