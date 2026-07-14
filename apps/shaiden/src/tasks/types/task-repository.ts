import type { SavedTask, Task, UpdateTaskRequest } from "@keidai/shared";

export const DEFAULT_TASK_LIST_LIMIT = 200;
export const MAX_TASK_LIST_LIMIT = 200;

export interface CreateTaskInput {
  task: Task;
}

export interface TaskRepository {
  create(input: CreateTaskInput): SavedTask;
  get(taskId: string): SavedTask | null;
  list(limit?: number): { tasks: SavedTask[] };
  update(taskId: string, input: UpdateTaskRequest): SavedTask | null;
  delete(taskId: string): boolean;
  hasRuns(taskId: string): boolean;
}
