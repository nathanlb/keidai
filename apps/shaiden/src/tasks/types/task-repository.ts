import type { SavedTask, Task, UpdateTaskRequest } from "@keidai/shared";

export const DEFAULT_TASK_LIST_LIMIT = 200;
export const MAX_TASK_LIST_LIMIT = 200;

export interface CreateTaskInput {
  task: Task;
}

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<SavedTask>;
  get(taskId: string): Promise<SavedTask | null>;
  list(limit?: number): Promise<{ tasks: SavedTask[] }>;
  update(taskId: string, input: UpdateTaskRequest): Promise<SavedTask | null>;
  archive(taskId: string): Promise<boolean>;
  /** Hard delete for internal rollback only (e.g. failed create-and-run). */
  delete(taskId: string): Promise<boolean>;
}
