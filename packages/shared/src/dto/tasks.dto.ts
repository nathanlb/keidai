import type { Task } from "../task.js";

/** Request body for `POST /api/tasks/run`. */
export type StartTaskRunRequest = Task;

export interface StartTaskRunResponse {
  runId: string;
}

export interface TaskRuntimeResponse {
  agentId: string;
}
