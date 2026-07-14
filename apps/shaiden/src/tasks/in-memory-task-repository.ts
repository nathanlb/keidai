import { randomUUID } from "node:crypto";
import { taskSchema, type SavedTask, type Task, type UpdateTaskRequest } from "@keidai/shared";
import type { CreateTaskInput, TaskRepository } from "./types/task-repository.js";

function compareTasks(left: SavedTask, right: SavedTask): number {
  const byTime = right.updatedAt.localeCompare(left.updatedAt);
  if (byTime !== 0) {
    return byTime;
  }
  return right.id.localeCompare(left.id);
}

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, SavedTask>();
  private readonly runCounts = new Map<string, number>();

  create(input: CreateTaskInput): SavedTask {
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

  get(taskId: string): SavedTask | null {
    return this.tasks.get(taskId) ?? null;
  }

  list() {
    const tasks = [...this.tasks.values()].sort(compareTasks);
    return { tasks };
  }

  update(taskId: string, input: UpdateTaskRequest): SavedTask | null {
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

  delete(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  hasRuns(taskId: string): boolean {
    return (this.runCounts.get(taskId) ?? 0) > 0;
  }

  /** Test helper for in-memory run linkage. */
  recordRunForTask(taskId: string): void {
    this.runCounts.set(taskId, (this.runCounts.get(taskId) ?? 0) + 1);
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
