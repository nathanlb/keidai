import type { RunListItem } from "@keidai/shared";

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

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Runs visibility request failed: ${response.status}`);
  }
  return (await response.json()) as T;
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
