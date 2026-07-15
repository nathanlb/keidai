import type { ServiceHealth } from "../../shell/types/service-health.js";
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

/** Shaiden API origin. Empty = same-origin (vite proxy or reverse proxy). */
const shaidenOrigin = (
  import.meta.env.VITE_SHAIDEN_URL as string | undefined
)?.replace(/\/$/, "") ?? "";

const shaidenDisplayUrl =
  shaidenOrigin || import.meta.env.VITE_SHAIDEN_URL || "http://127.0.0.1:3200";

export interface ShaidenHealthResponse {
  ok: boolean;
  version: string;
  agentId: string;
}

function shaidenApiPath(path: string): string {
  return `${shaidenOrigin}${path}`;
}

function shaidenHealthPath(): string {
  if (shaidenOrigin) {
    return `${shaidenOrigin}/api/health`;
  }

  return "/api/shaiden/health";
}

function parseDisplayAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return url;
  }
}

export function getShaidenDisplayAddress(): string {
  return parseDisplayAddress(shaidenDisplayUrl);
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
    shaidenApiPath(`/api/runs${serialized ? `?${serialized}` : ""}`),
  );
}

export async function fetchRun(runId: string): Promise<RunReport> {
  return fetchJson<RunReport>(
    shaidenApiPath(`/api/runs/${encodeURIComponent(runId)}`),
  );
}

export async function sendRunFollowUp(
  runId: string,
  message: string,
): Promise<{ runId: string }> {
  return fetchJsonWithBody<{ runId: string }>(
    shaidenApiPath(`/api/runs/${encodeURIComponent(runId)}/follow-up`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
}

export function getRunsEventsUrl(): string {
  return shaidenApiPath("/api/runs/events");
}

export async function fetchTaskRuntime(): Promise<TaskRuntimeResponse> {
  return fetchJson<TaskRuntimeResponse>(shaidenApiPath("/api/tasks/runtime"));
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
    shaidenApiPath(`/api/tasks${serialized ? `?${serialized}` : ""}`),
  );
}

export async function fetchTask(taskId: string): Promise<TaskResponse> {
  return fetchJson<TaskResponse>(
    shaidenApiPath(`/api/tasks/${encodeURIComponent(taskId)}`),
  );
}

export async function createTask(
  task: CreateTaskRequest,
): Promise<TaskResponse> {
  return fetchJsonWithBody<TaskResponse>(shaidenApiPath("/api/tasks"), {
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
    shaidenApiPath(`/api/tasks/${encodeURIComponent(taskId)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    },
  );
}

export async function deleteTask(taskId: string): Promise<void> {
  const response = await fetch(
    shaidenApiPath(`/api/tasks/${encodeURIComponent(taskId)}`),
    { method: "DELETE" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Delete task failed: ${response.status}`);
  }
}

export async function runSavedTask(
  taskId: string,
): Promise<StartTaskRunResponse> {
  const response = await fetch(
    shaidenApiPath(`/api/tasks/${encodeURIComponent(taskId)}/run`),
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
  const response = await fetch(shaidenApiPath("/api/tasks/run"), {
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
    const response = await fetch(shaidenHealthPath());
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
