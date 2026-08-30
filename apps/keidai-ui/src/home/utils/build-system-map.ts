import { DEFAULT_TASK_LIMITS, resolveTaskLimits } from "@keidai/shared";
import type {
  ApprovalRecordView,
  ConnectionStatus,
  GroupView,
  PublicServerConfig,
  RunReport,
  SavedTask,
} from "@keidai/shared";
import type { ManagementAgent } from "../../lib/api/agents.js";
import type { RunVisibilityListItem } from "../../lib/api/runs.js";
import type {
  HomeSystemMap,
  SystemMapAgent,
  SystemMapAgentState,
  SystemMapGroup,
  SystemMapServer,
} from "../types/home-digest.js";
import { formatCompactDurationSince } from "./format-compact-duration.js";
import { firstLine } from "./format-home-copy.js";
import {
  formatAgentStep,
  formatGroupScope,
  formatParkedApprovals,
  formatServerSub,
  mapCredentialAuth,
} from "./format-system-map.js";

export interface SystemMapSources {
  approvals: readonly ApprovalRecordView[];
  runs: readonly RunVisibilityListItem[];
  runReports: Readonly<Record<string, RunReport>>;
  tasks: readonly SavedTask[];
  agents: readonly ManagementAgent[];
  groups: readonly GroupView[];
  servers?: readonly PublicServerConfig[];
  connections?: readonly ConnectionStatus[];
  now?: number;
}

const TASK_TITLE_MAX = 48;

function taskTitle(goal: string): string {
  return firstLine(goal, TASK_TITLE_MAX) || "Untitled task";
}

function countGroupTools(group: GroupView): {
  toolCount: number;
  allowCount: number;
  gatedCount: number;
} {
  const tools = new Set<string>();
  let allowCount = 0;
  let gatedCount = 0;
  for (const server of group.servers) {
    for (const tool of server.allow) {
      tools.add(`${server.server}.${tool}`);
      allowCount += 1;
    }
    for (const tool of server.gated) {
      tools.add(`${server.server}.${tool}`);
      gatedCount += 1;
    }
  }
  return { toolCount: tools.size, allowCount, gatedCount };
}

function groupContainsServer(group: GroupView, serverName: string): boolean {
  return group.servers.some((policy) => policy.server === serverName);
}

function assignServerGroupId(
  serverName: string,
  groups: readonly GroupView[],
): string | null {
  const match = groups.find((group) => groupContainsServer(group, serverName));
  return match?.id ?? null;
}

function assignAgentGroupId(
  agent: ManagementAgent,
  groups: readonly GroupView[],
): string | null {
  for (const name of agent.groups) {
    const match = groups.find((group) => group.name === name);
    if (match) {
      return match.id;
    }
  }
  return null;
}

function countModelIterations(
  report: SystemMapSources["runReports"][string] | undefined,
  fallback: number,
): { current: number; max: number } {
  if (!report) {
    return { current: fallback, max: DEFAULT_TASK_LIMITS.max_iterations };
  }
  const limits = resolveTaskLimits(report.task);
  const current = report.steps.filter((step) => step.kind === "model").length;
  return { current, max: limits.max_iterations };
}

function agentState(options: {
  hasLiveRun: boolean;
  parkedCount: number;
}): SystemMapAgentState {
  if (options.hasLiveRun) {
    return "working";
  }
  if (options.parkedCount > 0) {
    return "waiting";
  }
  return "idle";
}

function projectAgent(
  agent: ManagementAgent,
  sources: SystemMapSources,
  now: number,
  liveByAssignee: ReadonlyMap<string, RunVisibilityListItem>,
  parkedByAssignee: ReadonlyMap<string, { count: number; since: string; task: string }>,
): SystemMapAgent {
  const live = liveByAssignee.get(agent.id);
  const parked = parkedByAssignee.get(agent.id);
  const state = agentState({
    hasLiveRun: Boolean(live),
    parkedCount: parked?.count ?? 0,
  });
  const label = agent.slug || agent.name || agent.id;

  if (state === "working" && live) {
    const steps = countModelIterations(
      sources.runReports[live.id],
      live.stepCount,
    );
    return {
      id: agent.id,
      label,
      groupId: assignAgentGroupId(agent, sources.groups),
      state,
      task: `${taskTitle(live.goalPreview)} · ${formatAgentStep(steps.current, steps.max)}`,
      meta: formatCompactDurationSince(live.startedAt, now),
    };
  }

  if (state === "waiting" && parked) {
    return {
      id: agent.id,
      label,
      groupId: assignAgentGroupId(agent, sources.groups),
      state,
      task: `${parked.task} · ${formatParkedApprovals(parked.count)}`,
      meta: formatCompactDurationSince(parked.since, now),
    };
  }

  return {
    id: agent.id,
    label,
    groupId: assignAgentGroupId(agent, sources.groups),
    state: "idle",
    task: "no task running",
    meta: "idle",
  };
}

export function buildSystemMap(sources: SystemMapSources): HomeSystemMap {
  const now = sources.now ?? Date.now();
  const servers = sources.servers ?? [];
  const connections = sources.connections ?? [];
  const connectionByName = new Map(
    connections.map((connection) => [connection.name, connection]),
  );

  const groups: SystemMapGroup[] = sources.groups.map((group) => {
    const { toolCount, allowCount, gatedCount } = countGroupTools(group);
    const allGated = gatedCount > 0 && allowCount === 0;
    return {
      id: group.id,
      name: group.name,
      scope: formatGroupScope(toolCount, allGated),
      allGated,
    };
  });
  const groupsById = new Map(groups.map((group) => [group.id, group]));

  const mapServers: SystemMapServer[] = servers.map((server) => {
    const groupId = assignServerGroupId(server.name, sources.groups);
    const group = groupId ? groupsById.get(groupId) : undefined;
    const toolCount = connectionByName.get(server.name)?.toolCount ?? null;
    const auth = mapCredentialAuth(server.credential.strategy);
    return {
      id: server.name,
      label: server.name,
      sub: formatServerSub({
        toolCount,
        auth,
        gated: group?.allGated ?? false,
      }),
      groupId,
    };
  });

  const pending = sources.approvals.filter(
    (record) => record.status === "pending",
  );
  const parkedRunIds = new Set(
    pending.flatMap((record) => (record.runId ? [record.runId] : [])),
  );
  const liveByAssignee = new Map<string, RunVisibilityListItem>();
  for (const run of sources.runs) {
    if (run.status !== "running" || parkedRunIds.has(run.id)) {
      continue;
    }
    const current = liveByAssignee.get(run.assignee);
    if (
      !current ||
      Date.parse(run.startedAt) > Date.parse(current.startedAt)
    ) {
      liveByAssignee.set(run.assignee, run);
    }
  }

  const runsById = new Map(sources.runs.map((run) => [run.id, run]));
  const parkedByAssignee = new Map<
    string,
    { count: number; since: string; task: string }
  >();
  for (const approval of pending) {
    const run = approval.runId ? runsById.get(approval.runId) : undefined;
    const existing = parkedByAssignee.get(approval.agentId);
    const since = existing
      ? Date.parse(approval.createdAt) < Date.parse(existing.since)
        ? approval.createdAt
        : existing.since
      : approval.createdAt;
    parkedByAssignee.set(approval.agentId, {
      count: (existing?.count ?? 0) + 1,
      since,
      task: run ? taskTitle(run.goalPreview) : "task",
    });
  }

  const agents: SystemMapAgent[] = sources.agents.map((agent) =>
    projectAgent(agent, sources, now, liveByAssignee, parkedByAssignee),
  );

  return {
    servers: mapServers,
    groups,
    agents,
    workingCount: agents.filter((agent) => agent.state === "working").length,
  };
}
