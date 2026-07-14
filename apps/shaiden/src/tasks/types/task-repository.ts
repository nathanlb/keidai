import type { SavedTask, Task, UpdateTaskRequest } from "@keidai/shared";

export interface CreateTaskInput {
  task: Task;
}

export interface TaskRepository {
  create(input: CreateTaskInput): SavedTask;
  get(taskId: string): SavedTask | null;
  list(): { tasks: SavedTask[] };
  update(taskId: string, input: UpdateTaskRequest): SavedTask | null;
  delete(taskId: string): boolean;
  hasRuns(taskId: string): boolean;
}
