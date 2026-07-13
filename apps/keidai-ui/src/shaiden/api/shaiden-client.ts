import type {
  RunReport,
  RunsResponse,
  StartTaskRunRequest,
  StartTaskRunResponse,
  TaskRuntimeResponse,
} from "@keidai/shared";

/** Shaiden API origin. Empty = same-origin (vite proxy or reverse proxy). */
const shaidenOrigin = (
  import.meta.env.VITE_SHAIDEN_URL as string | undefined
)?.replace(/\/$/, "") ?? "";

function shaidenApiPath(path: string): string {
  return `${shaidenOrigin}${path}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Shaiden request failed: ${response.status}`);
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

export function getRunsEventsUrl(): string {
  return shaidenApiPath("/api/runs/events");
}

export async function fetchTaskRuntime(): Promise<TaskRuntimeResponse> {
  return fetchJson<TaskRuntimeResponse>(shaidenApiPath("/api/tasks/runtime"));
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
