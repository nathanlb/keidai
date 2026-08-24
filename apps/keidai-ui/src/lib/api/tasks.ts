import type {
  CreateTaskRequest,
  StartTaskRunRequest,
  StartTaskRunResponse,
  TaskResponse,
  TaskRuntimeResponse,
  TasksResponse,
  UpdateTaskRequest,
} from "@keidai/shared";
import { fetchJson, fetchJsonWithBody, readErrorMessage } from "./fetch-json.js";

export async function fetchTaskRuntime(): Promise<TaskRuntimeResponse> {
  return fetchJson<TaskRuntimeResponse>("/api/tasks/runtime");
}

export async function fetchTasks(
  query: { limit?: number } = {},
): Promise<TasksResponse> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  const serialized = params.toString();
  return fetchJson<TasksResponse>(
    `/api/tasks${serialized ? `?${serialized}` : ""}`,
  );
}

export async function fetchTask(taskId: string): Promise<TaskResponse> {
  return fetchJson<TaskResponse>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
  );
}

export async function createTask(
  task: CreateTaskRequest,
): Promise<TaskResponse> {
  return fetchJsonWithBody<TaskResponse>("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
}

export async function updateTask(
  taskId: string,
  task: UpdateTaskRequest,
): Promise<TaskResponse> {
  return fetchJsonWithBody<TaskResponse>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    },
  );
}

export async function archiveTask(taskId: string): Promise<void> {
  const response = await fetch(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Archive task failed: ${response.status}`),
    );
  }
}

export async function runSavedTask(
  taskId: string,
): Promise<StartTaskRunResponse> {
  const response = await fetch(
    `/api/tasks/${encodeURIComponent(taskId)}/run`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Start task failed: ${response.status}`),
    );
  }

  return (await response.json()) as StartTaskRunResponse;
}

export async function startTaskRun(
  task: StartTaskRunRequest,
): Promise<StartTaskRunResponse> {
  const response = await fetch("/api/tasks/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Start task failed: ${response.status}`),
    );
  }

  return (await response.json()) as StartTaskRunResponse;
}
