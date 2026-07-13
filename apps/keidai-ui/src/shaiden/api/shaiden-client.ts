import type { ServiceHealth } from "../../shell/types/service-health.js";
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
