import { randomUUID } from "node:crypto";
import {
  nextRunAtAfterUpdate,
  nextRunAtIso,
  taskSchema,
  type SavedTask,
  type Task,
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
} from "../types/task-repository.js";
import {
  DEFAULT_DUE_TASK_LIMIT,
  DEFAULT_TASK_LIST_LIMIT,
  MAX_SCHEDULE_START_ATTEMPTS,
} from "../types/task-repository.js";

interface ScheduleLock {
  claimUntil: string | null;
  attempts: number;
}

function compareTasks(left: SavedTask, right: SavedTask): number {
  const byTime = right.updatedAt.localeCompare(left.updatedAt);
  if (byTime !== 0) {
    return byTime;
  }
  return right.id.localeCompare(left.id);
}

function withNextRunAt(task: SavedTask, fromUtc: Date): SavedTask {
  return {
    ...task,
    nextRunAt: nextRunAtIso(task.trigger, fromUtc),
  };
}

function withoutFailure(task: SavedTask): SavedTask {
  const { scheduleFailedAt: _failedAt, scheduleError: _error, ...rest } = task;
  return rest;
}

/** @internal Test-only. Not for production use. */
export class MockTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, SavedTask>();
  private readonly locks = new Map<string, ScheduleLock>();

  private lockOf(taskId: string): ScheduleLock {
    const existing = this.locks.get(taskId);
    if (existing) {
      return existing;
    }
    const created = { claimUntil: null, attempts: 0 };
    this.locks.set(taskId, created);
    return created;
  }

  async create(input: CreateTaskInput): Promise<SavedTask> {
    const now = new Date();
    const nowIso = now.toISOString();
    const saved = withNextRunAt(
      {
        id: randomUUID(),
        ...input.task,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      now,
    );
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

    const now = new Date();
    const cursor = nextRunAtAfterUpdate(
      existing.trigger,
      existing.nextRunAt,
      merged.trigger,
      now,
    );
    if (cursor.resetScheduleState) {
      this.locks.set(taskId, { claimUntil: null, attempts: 0 });
    }
    const updated: SavedTask = {
      ...(cursor.resetScheduleState ? withoutFailure(existing) : existing),
      ...merged,
      updatedAt: now.toISOString(),
      nextRunAt: cursor.nextRunAt,
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
    this.locks.set(taskId, { claimUntil: null, attempts: 0 });
    this.tasks.set(taskId, {
      ...withoutFailure(existing),
      archivedAt: now,
      updatedAt: now,
      nextRunAt: null,
    });
    return true;
  }

  async delete(taskId: string): Promise<boolean> {
    this.locks.delete(taskId);
    return this.tasks.delete(taskId);
  }

  async claimDueTasks(input: ClaimDueTasksInput): Promise<SavedTask[]> {
    const limit = input.limit ?? DEFAULT_DUE_TASK_LIMIT;
    const nowMs = input.now.getTime();
    const due = [...this.tasks.values()]
      .filter((task) => {
        if (task.archivedAt || !task.nextRunAt || task.scheduleFailedAt) {
          return false;
        }
        if (Date.parse(task.nextRunAt) > nowMs) {
          return false;
        }
        const claimUntil = this.lockOf(task.id).claimUntil;
        if (claimUntil && Date.parse(claimUntil) > nowMs) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const byTime = (left.nextRunAt ?? "").localeCompare(right.nextRunAt ?? "");
        return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
      })
      .slice(0, limit);

    const claimUntil = input.claimUntil.toISOString();
    return due.map((task) => {
      const lock = this.lockOf(task.id);
      lock.claimUntil = claimUntil;
      return task;
    });
  }

  async setNextRunAt(taskId: string, nextRunAt: string | null): Promise<boolean> {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      return false;
    }
    this.tasks.set(taskId, { ...existing, nextRunAt });
    return true;
  }

  async recordScheduleSuccess(
    input: RecordScheduleSuccessInput,
  ): Promise<boolean> {
    const existing = this.tasks.get(input.taskId);
    if (!existing || existing.archivedAt) {
      return false;
    }
    this.locks.set(input.taskId, { claimUntil: null, attempts: 0 });
    this.tasks.set(input.taskId, {
      ...withoutFailure(existing),
      nextRunAt: input.nextRunAt,
    });
    return true;
  }

  async recordScheduleStartFailure(
    input: RecordScheduleStartFailureInput,
  ): Promise<ScheduleStartFailureOutcome> {
    const existing = this.tasks.get(input.taskId);
    if (!existing || existing.archivedAt) {
      return "missing";
    }
    const lock = this.lockOf(input.taskId);
    lock.attempts += 1;
    if (lock.attempts >= MAX_SCHEDULE_START_ATTEMPTS) {
      lock.claimUntil = null;
      this.tasks.set(input.taskId, {
        ...existing,
        nextRunAt: null,
        scheduleFailedAt: input.now.toISOString(),
        scheduleError: input.error,
      });
      return "failed";
    }
    lock.claimUntil = input.retryUntil.toISOString();
    return "retry";
  }

  async deferScheduleClaim(input: DeferScheduleClaimInput): Promise<boolean> {
    const existing = this.tasks.get(input.taskId);
    if (!existing || existing.archivedAt) {
      return false;
    }
    this.lockOf(input.taskId).claimUntil = input.claimUntil
      ? input.claimUntil.toISOString()
      : null;
    return true;
  }

  async peekMinNextRunAt(): Promise<string | null> {
    let min: string | null = null;
    for (const task of this.tasks.values()) {
      if (task.archivedAt || !task.nextRunAt || task.scheduleFailedAt) {
        continue;
      }
      const claimUntil = this.lockOf(task.id).claimUntil;
      const wakeAt =
        claimUntil && claimUntil > task.nextRunAt ? claimUntil : task.nextRunAt;
      if (min === null || wakeAt < min) {
        min = wakeAt;
      }
    }
    return min;
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
