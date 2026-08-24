import type { RunListItem, RunsResponse } from "@keidai/shared";
import type {
  FudaManagementAgent,
  RunAssigneeDisplay,
  RunVisibilityListItem,
  RunsVisibilityResponse,
} from "./runs-visibility.dto.js";

function deriveAgentInitials(name: string): string {
  const parts = name
    .split(/[\s-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export function toRunAssigneeDisplay(
  agent: FudaManagementAgent,
): RunAssigneeDisplay {
  const displayName = agent.name || agent.slug;

  return {
    id: agent.id,
    name: agent.name,
    slug: agent.slug,
    displayName,
    initials: deriveAgentInitials(displayName),
  };
}

export function buildAgentsById(
  agents: readonly FudaManagementAgent[],
): Record<string, RunAssigneeDisplay> {
  const agentsById: Record<string, RunAssigneeDisplay> = {};

  for (const agent of agents) {
    agentsById[agent.id] = toRunAssigneeDisplay(agent);
  }

  return agentsById;
}

function enrichRunListItem(
  run: RunListItem,
  agentsById: Record<string, RunAssigneeDisplay>,
): RunVisibilityListItem {
  return {
    ...run,
    assigneeDisplay: agentsById[run.assignee] ?? null,
  };
}

export function buildRunsVisibilityResponse(
  runsResponse: RunsResponse,
  agents: readonly FudaManagementAgent[],
): RunsVisibilityResponse {
  const agentsById = buildAgentsById(agents);

  return {
    runs: runsResponse.runs.map((run) => enrichRunListItem(run, agentsById)),
    agentsById,
  };
}
