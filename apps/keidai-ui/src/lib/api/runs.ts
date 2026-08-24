import type { RunListItem, RunReport } from "@keidai/shared";
import type { ServiceHealth } from "../types/service-health.js";
import { resolveBackendDisplayAddress } from "../utils/resolve-backend-display-address.js";
import { fetchJson, fetchJsonWithBody } from "./fetch-json.js";

export interface RunAssigneeDisplay {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  initials: string;
}

export interface RunVisibilityListItem extends RunListItem {
  assigneeDisplay: RunAssigneeDisplay | null;
}

export interface RunsVisibilityResponse {
  runs: RunVisibilityListItem[];
  agentsById: Record<string, RunAssigneeDisplay>;
}

interface RuntimeHealthResponse {
  ok: boolean;
  version: string;
}

/** Display-only backend address for the health footer (API calls are same-origin `/api/*` via the BFF). */
export function getRuntimeDisplayAddress(): string {
  return resolveBackendDisplayAddress(
    "VITE_SHAIDEN_URL",
    import.meta.env.VITE_SHAIDEN_URL,
  );
}

/** @deprecated Use getRuntimeDisplayAddress */
export const getShaidenDisplayAddress = getRuntimeDisplayAddress;

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

export async function stopRun(runId: string): Promise<{ runId: string }> {
  return fetchJsonWithBody<{ runId: string }>(
    `/api/runs/${encodeURIComponent(runId)}/stop`,
    { method: "POST" },
  );
}

export async function resumeRun(runId: string): Promise<{ runId: string }> {
  return fetchJsonWithBody<{ runId: string }>(
    `/api/runs/${encodeURIComponent(runId)}/resume`,
    { method: "POST" },
  );
}

export function getRunsEventsUrl(): string {
  return "/api/runs/events";
}

export async function fetchRunsVisibility(
  query: { limit?: number } = {},
): Promise<RunsVisibilityResponse> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  const serialized = params.toString();
  return fetchJson<RunsVisibilityResponse>(
    `/api/ui/shaiden/runs${serialized ? `?${serialized}` : ""}`,
  );
}

export async function fetchRuntimeHealth(): Promise<ServiceHealth> {
  const displayAddress = getRuntimeDisplayAddress();

  try {
    const response = await fetch("/api/shaiden/health");
    if (!response.ok) {
      throw new Error(`Health request failed: ${response.status}`);
    }

    const health = (await response.json()) as RuntimeHealthResponse;
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

/** @deprecated Use fetchRuntimeHealth */
export const fetchShaidenHealth = fetchRuntimeHealth;
