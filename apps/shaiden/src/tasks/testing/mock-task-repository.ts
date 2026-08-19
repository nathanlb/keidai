import { randomUUID } from "node:crypto";
import {
  taskSchema,
  type SavedTask,
  type Task,
  type UpdateTaskRequest,
} from "@keidai/shared";
import type { CreateTaskInput, TaskRepository } from "../types/task-repository.js";
import { DEFAULT_TASK_LIST_LIMIT } from "../types/task-repository.js";

function compareTasks(left: SavedTask, right: SavedTask): number {
  const byTime = right.updatedAt.localeCompare(left.updatedAt);
  if (byTime !== 0) {
    return byTime;
  }
  return right.id.localeCompare(left.id);
}

/** @internal Test-only. Not for production use. */
export class MockTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, SavedTask>();

  async create(input: CreateTaskInput): Promise<SavedTask> {
    const now = new Date().toISOString();
    const saved: SavedTask = {
      id: randomUUID(),
      ...input.task,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(saved.id, saved);
    return saved;
  }

  async get(taskId: string): Promise<SavedTask | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async list(limit = DEFAULT_TASK_LIST_LIMIT) {
    const tasks = [...this.tasks.values()]
      .filter((task) => !task.archivedAt)
      .sort(compareTasks)
      .slice(0, limit);
    return { tasks };
  }

  async update(taskId: string, input: UpdateTaskRequest): Promise<SavedTask | null> {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      return null;
    }

    const merged = taskSchema.parse({
      goal: input.goal ?? existing.goal,
      trigger: input.trigger ?? existing.trigger,
      assignee: input.assignee ?? existing.assignee,
      limits: input.limits === undefined ? existing.limits : input.limits,
    });

    const updated: SavedTask = {
      ...existing,
      ...merged,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  async archive(taskId: string): Promise<boolean> {
    const existing = this.tasks.get(taskId);
    if (!existing || existing.archivedAt) {
      return false;
    }

    const now = new Date().toISOString();
    this.tasks.set(taskId, {
      ...existing,
      archivedAt: now,
      updatedAt: now,
    });
    return true;
  }

  async delete(taskId: string): Promise<boolean> {
    return this.tasks.delete(taskId);
  }
}

export function savedTaskToTask(saved: SavedTask): Task {
  return taskSchema.parse({
    goal: saved.goal,
    trigger: saved.trigger,
    assignee: saved.assignee,
    limits: saved.limits,
  });
}
