import type { RunListItem } from "@keidai/shared";

export interface RunAssigneeDisplay {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  initials: string;
  emoji: string | null;
}

export interface RunVisibilityListItem extends RunListItem {
  assigneeDisplay: RunAssigneeDisplay | null;
}

export interface RunsVisibilityResponse {
  runs: RunVisibilityListItem[];
  agentsById: Record<string, RunAssigneeDisplay>;
}

export interface FudaManagementAgent {
  id: string;
  slug: string;
  name: string;
  emoji?: string | null;
}
