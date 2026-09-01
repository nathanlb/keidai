import type { SavedTask, Task, UpdateTaskRequest } from "@keidai/shared";

export const DEFAULT_TASK_LIST_LIMIT = 200;
export const MAX_TASK_LIST_LIMIT = 200;
export const DEFAULT_DUE_TASK_LIMIT = 10;
/** First failed start retries once; the second failure stops the schedule. */
export const MAX_SCHEDULE_START_ATTEMPTS = 2;

export interface CreateTaskInput {
  task: Task;
}

export interface ClaimDueTasksInput {
  now: Date;
  claimUntil: Date;
  limit?: number;
}

export interface RecordScheduleSuccessInput {
  taskId: string;
  nextRunAt: string | null;
}

export interface RecordScheduleStartFailureInput {
  taskId: string;
  error: string;
  retryUntil: Date;
  now: Date;
}

export type ScheduleStartFailureOutcome = "retry" | "failed" | "missing";

export interface DeferScheduleClaimInput {
  taskId: string;
  claimUntil: Date | null;
}

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<SavedTask>;
  get(taskId: string): Promise<SavedTask | null>;
  list(limit?: number): Promise<{ tasks: SavedTask[] }>;
  update(taskId: string, input: UpdateTaskRequest): Promise<SavedTask | null>;
  archive(taskId: string): Promise<boolean>;
  /** Hard delete for internal rollback only (e.g. failed create-and-run). */
  delete(taskId: string): Promise<boolean>;
  claimDueTasks(input: ClaimDueTasksInput): Promise<SavedTask[]>;
  setNextRunAt(taskId: string, nextRunAt: string | null): Promise<boolean>;
  recordScheduleSuccess(input: RecordScheduleSuccessInput): Promise<boolean>;
  recordScheduleStartFailure(
    input: RecordScheduleStartFailureInput,
  ): Promise<ScheduleStartFailureOutcome>;
  deferScheduleClaim(input: DeferScheduleClaimInput): Promise<boolean>;
  peekMinNextRunAt(): Promise<string | null>;
}
