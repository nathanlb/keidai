import type { ServiceHealth } from "../../shell/types/service-health.js";
import { resolveBackendDisplayAddress } from "../../shell/utils/resolve-backend-display-address.js";
import type {
  CreateTaskRequest,
  RunReport,
  RunsResponse,
  SavedTask,
  StartTaskRunRequest,
  StartTaskRunResponse,
  TaskResponse,
  TaskRuntimeResponse,
  TasksResponse,
  UpdateTaskRequest,
} from "@keidai/shared";

export interface ShaidenHealthResponse {
  ok: boolean;
  version: string;
}

/** Display-only backend address for the health footer (API calls are same-origin `/api/*` via the BFF). */
export function getShaidenDisplayAddress(): string {
  return resolveBackendDisplayAddress(
    "VITE_SHAIDEN_URL",
    import.meta.env.VITE_SHAIDEN_URL,
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Shaiden request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchJsonWithBody<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Shaiden request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchRuns(
  query: { limit?: number } = {},
): Promise<RunsResponse> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  const serialized = params.toString();
  return fetchJson<RunsResponse>(
    `/api/runs${serialized ? `?${serialized}` : ""}`,
  );
}

export async function fetchRun(runId: string): Promise<RunReport> {
  return fetchJson<RunReport>(`/api/runs/${encodeURIComponent(runId)}`);
}

export async function sendRunFollowUp(
  runId: string,
  message: string,
): Promise<{ runId: string }> {
  return fetchJsonWithBody<{ runId: string }>(
    `/api/runs/${encodeURIComponent(runId)}/follow-up`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
}

export function getRunsEventsUrl(): string {
  return "/api/runs/events";
}

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
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Archive task failed: ${response.status}`);
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
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Start task failed: ${response.status}`);
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
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Start task failed: ${response.status}`);
  }

  return (await response.json()) as StartTaskRunResponse;
}

export async function fetchShaidenHealth(): Promise<ServiceHealth> {
  const displayAddress = getShaidenDisplayAddress();

  try {
    const response = await fetch("/api/shaiden/health");
    if (!response.ok) {
      throw new Error(`Shaiden health request failed: ${response.status}`);
    }

    const health = (await response.json()) as ShaidenHealthResponse;
    return {
      healthy: health.ok,
      label: health.ok ? "Healthy" : "Degraded",
      displayAddress,
      version: health.version,
    };
  } catch {
    return {
      healthy: false,
      label: "Unreachable",
      displayAddress,
      version: "",
    };
  }
}

export type { SavedTask };
