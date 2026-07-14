import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { taskSchema, type SavedTask, type UpdateTaskRequest } from "@keidai/shared";
import type { CreateTaskInput, TaskRepository } from "./types/task-repository.js";
import { DEFAULT_TASK_LIST_LIMIT } from "./types/task-repository.js";

interface TaskRow {
  id: string;
  goal: string;
  trigger_json: string;
  assignee: string;
  limits_json: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSavedTask(row: TaskRow): SavedTask {
  const task = taskSchema.parse({
    goal: row.goal,
    trigger: JSON.parse(row.trigger_json),
    assignee: row.assignee,
    limits: row.limits_json ? JSON.parse(row.limits_json) : undefined,
  });
  return {
    id: row.id,
    ...task,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteTaskRepository implements TaskRepository {
  private readonly insertStatement;
  private readonly getStatement;
  private readonly listStatement;
  private readonly updateStatement;
  private readonly deleteStatement;
  private readonly hasRunsStatement;

  constructor(private readonly db: DatabaseSync) {
    this.insertStatement = db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        @id, @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `);
    this.getStatement = db.prepare(`
      SELECT id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      FROM tasks
      WHERE id = ?
    `);
    this.listStatement = db.prepare(`
      SELECT id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      FROM tasks
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `);
    this.updateStatement = db.prepare(`
      UPDATE tasks
      SET goal = @goal,
          trigger_json = @trigger_json,
          assignee = @assignee,
          limits_json = @limits_json,
          updated_at = @updated_at
      WHERE id = @id
    `);
    this.deleteStatement = db.prepare(`DELETE FROM tasks WHERE id = ?`);
    this.hasRunsStatement = db.prepare(`
      SELECT 1 AS found FROM runs WHERE task_id = ? LIMIT 1
    `);
  }

  create(input: CreateTaskInput): SavedTask {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.insertStatement.run({
      id,
      goal: input.task.goal,
      trigger_json: JSON.stringify(input.task.trigger),
      assignee: input.task.assignee,
      limits_json: input.task.limits ? JSON.stringify(input.task.limits) : null,
      created_at: now,
      updated_at: now,
    });
    return {
      id,
      ...input.task,
      createdAt: now,
      updatedAt: now,
    };
  }

  get(taskId: string): SavedTask | null {
    const row = this.getStatement.get(taskId) as TaskRow | undefined;
    return row ? rowToSavedTask(row) : null;
  }

  list(limit = DEFAULT_TASK_LIST_LIMIT) {
    const rows = this.listStatement.all(limit) as unknown as TaskRow[];
    return { tasks: rows.map(rowToSavedTask) };
  }

  update(taskId: string, input: UpdateTaskRequest): SavedTask | null {
    const existing = this.get(taskId);
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
    this.updateStatement.run({
      id: taskId,
      goal: merged.goal,
      trigger_json: JSON.stringify(merged.trigger),
      assignee: merged.assignee,
      limits_json: merged.limits ? JSON.stringify(merged.limits) : null,
      updated_at: updatedAt,
    });
    return {
      ...existing,
      ...merged,
      updatedAt,
    };
  }

  delete(taskId: string): boolean {
    const result = this.deleteStatement.run(taskId);
    return result.changes > 0;
  }

  hasRuns(taskId: string): boolean {
    const row = this.hasRunsStatement.get(taskId) as { found: number } | undefined;
    return row !== undefined;
  }
}
