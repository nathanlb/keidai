import type { Task } from "../task.js";

/** Persisted task definition with metadata. */
export interface SavedTask extends Task {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  /** UTC instant of the next scheduler fire; null when none. */
  nextRunAt?: string | null;
  /** Set when the scheduler stopped after exhausting start retries. */
  scheduleFailedAt?: string | null;
  scheduleError?: string | null;
}

export interface TasksResponse {
  tasks: SavedTask[];
}

export interface TaskResponse {
  task: SavedTask;
}

/** Request body for `POST /api/tasks` and `POST /api/tasks/run`. */
export type CreateTaskRequest = Task;

/** Request body for `PATCH /api/tasks/:taskId`. */
export type UpdateTaskRequest = Partial<Task>;

/** Request body for `POST /api/tasks/run` (create saved task and start run). */
export type StartTaskRunRequest = Task;

export interface StartTaskRunResponse {
  runId: string;
  taskId: string;
}

export interface TaskRuntimeResponse {
  ready: boolean;
}
