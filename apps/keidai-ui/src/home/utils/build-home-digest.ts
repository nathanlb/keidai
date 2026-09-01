import type {
  ApprovalRecordView,
  ConnectionStatus,
  GroupView,
  PublicServerConfig,
  RunListItem,
  RunReport,
  RunStep,
  SavedTask,
} from "@keidai/shared";
import {
  DEFAULT_TASK_LIMITS,
  isScheduleTrigger,
  resolveTaskLimits,
} from "@keidai/shared";
import type { ManagementAgent } from "../../lib/api/agents.js";
import type { RunVisibilityListItem } from "../../lib/api/runs.js";
import { deriveAgentInitials } from "../../lib/utils/derive-agent-initials.js";
import { parseNamespacedToolName } from "../../approvals/utils/parse-namespaced-tool-name.js";
import { runDetailHref, taskEditHref } from "../../runs/navigation.js";
import {
  APPROVAL_ID_PARAM,
  APPROVALS_PATH,
} from "../../shell/navigation.js";
import type {
  HomeAgentCard,
  HomeAgentHealth,
  HomeAttentionItem,
  HomeDigest,
  HomeGoalDay,
  HomeLiveRun,
  HomeRecentRun,
  HomeScheduledTask,
} from "../types/home-digest.js";
import { lastOutcomeForTask } from "../../agents/utils/agent-activity.js";
import {
  formatNextRunLabel,
  formatScheduleTrigger,
} from "../../tasks/utils/format-schedule.js";
import { deriveApprovalImpact } from "./derive-approval-impact.js";
import { deriveGoalVerdict } from "./derive-goal-verdict.js";
import { buildSystemMap } from "./build-system-map.js";
import {
  formatCompactDuration,
  formatCompactDurationSince,
} from "./format-compact-duration.js";
import { formatHomeClock } from "./format-home-clock.js";
import {
  firstLine,
  formatAgentCount,
  formatHomeSubtitle,
  formatOldestParkedSub,
  formatTaskCount,
  formatToolCount,
} from "./format-home-copy.js";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const RECENT_LIMIT = 5;
const AGENT_STRIP_LIMIT = 3;
const TASK_TITLE_MAX = 48;

export interface HomeDigestSources {
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

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isWithinLast24h(timestamp: string, now: number): boolean {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) {
    return false;
  }
  return now - then <= DAY_MS && now - then >= 0;
}

function taskTitle(goal: string): string {
  return firstLine(goal, TASK_TITLE_MAX) || "Untitled task";
}

function agentLabel(
  assigneeId: string,
  run: RunVisibilityListItem | undefined,
  agentsById: Readonly<Record<string, ManagementAgent>>,
): string {
  if (run?.assigneeDisplay?.slug) {
    return run.assigneeDisplay.slug;
  }
  if (run?.assigneeDisplay?.displayName) {
    return run.assigneeDisplay.displayName;
  }
  const agent = agentsById[assigneeId];
  return agent?.slug || agent?.name || assigneeId;
}

function approvalReviewHref(approvalId: string): string {
  return `${APPROVALS_PATH}?${APPROVAL_ID_PARAM}=${encodeURIComponent(approvalId)}`;
}

function currentStepText(steps: readonly RunStep[]): string {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (!step) {
      continue;
    }
    if (step.kind === "model" && step.text) {
      return firstLine(step.text, 90);
    }
    if (step.kind === "tool_dispatch" && step.toolName) {
      return `Calling ${step.toolName}`;
    }
    if (step.kind === "waiting_approval" && step.toolName) {
      return `Waiting on ${step.toolName}`;
    }
  }
  return "Working…";
}

function countModelIterations(steps: readonly RunStep[]): number {
  return steps.filter((step) => step.kind === "model").length;
}

function buildLiveRun(
  run: RunVisibilityListItem,
  report: RunReport | undefined,
  agentsById: Readonly<Record<string, ManagementAgent>>,
  now: number,
): HomeLiveRun {
  const limits = report
    ? resolveTaskLimits(report.task)
    : DEFAULT_TASK_LIMITS;
  const iteration = report
    ? countModelIterations(report.steps)
    : run.stepCount;
  const progressPct =
    limits.max_iterations <= 0
      ? 0
      : Math.min(100, Math.round((iteration / limits.max_iterations) * 100));

  return {
    id: run.id,
    task: taskTitle(run.goalPreview),
    agent: agentLabel(run.assignee, run, agentsById),
    elapsedLabel: formatCompactDurationSince(run.startedAt, now),
    stepText: report ? currentStepText(report.steps) : "Working…",
    progressPct,
    iterationLabel: `${iteration} / ${limits.max_iterations}`,
  };
}

function buildWeek(
  completed: readonly RunListItem[],
  now: number,
): HomeGoalDay[] {
  const todayStart = startOfLocalDay(now);
  return Array.from({ length: 7 }, (_, index) => {
    const start = todayStart - (6 - index) * DAY_MS;
    const end = start + DAY_MS;
    let met = 0;
    let missed = 0;
    for (const run of completed) {
      const started = new Date(run.startedAt).getTime();
      if (Number.isNaN(started) || started < start || started >= end) {
        continue;
      }
      if (run.outcome?.status === "goal_met") {
        met += 1;
      } else {
        missed += 1;
      }
    }
    const total = met + missed;
    return {
      label: WEEKDAY_LABELS[new Date(start).getDay()] ?? "",
      metPct: total === 0 ? 0 : Math.round((met / total) * 100),
      partialPct: 0,
      missedPct: total === 0 ? 0 : Math.round((missed / total) * 100),
    };
  });
}

function countEffectiveTools(
  agent: ManagementAgent,
  groups: readonly GroupView[],
): number {
  const membership = new Set(agent.groups);
  const tools = new Set<string>();
  for (const group of groups) {
    if (!membership.has(group.name)) {
      continue;
    }
    for (const server of group.servers) {
      for (const tool of server.allow) {
        tools.add(`${server.server}.${tool}`);
      }
      for (const tool of server.gated) {
        tools.add(`${server.server}.${tool}`);
      }
    }
  }
  return tools.size;
}

function agentHealth(
  agentId: string,
  liveAssigneeIds: ReadonlySet<string>,
  failedAssigneeIds: ReadonlySet<string>,
): HomeAgentHealth {
  if (failedAssigneeIds.has(agentId)) {
    return "failing";
  }
  if (liveAssigneeIds.has(agentId)) {
    return "healthy";
  }
  return "idle";
}

function agentSummary(persona: string): string {
  return firstLine(persona, 90) || "No persona written.";
}

function buildAttention(options: {
  pending: readonly ApprovalRecordView[];
  failed24h: readonly RunVisibilityListItem[];
  runsById: Readonly<Record<string, RunVisibilityListItem>>;
  agentsById: Readonly<Record<string, ManagementAgent>>;
  now: number;
}): HomeAttentionItem[] {
  const { pending, failed24h, runsById, agentsById, now } = options;
  const approvalRows: HomeAttentionItem[] = [...pending]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map((approval) => {
      const { server, tool } = parseNamespacedToolName(approval.toolName);
      const run = approval.runId ? runsById[approval.runId] : undefined;
      const task = run ? taskTitle(run.goalPreview) : "task";
      const runId = approval.runId ?? "run";
      const agent = agentLabel(approval.agentId, run, agentsById);
      return {
        id: approval.id,
        kind: "approval",
        mark: (server[0] ?? "?").toUpperCase(),
        tool,
        impact: deriveApprovalImpact(approval.params),
        context: `${task} · ${runId} · ${agent}`,
        parkedLabel: formatCompactDurationSince(approval.createdAt, now),
        reviewHref: approvalReviewHref(approval.id),
        cta: { type: "approve", approvalId: approval.id },
        ctaLabel: "Approve",
      };
    });

  const failedRows: HomeAttentionItem[] = [...failed24h]
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .map((run) => {
      const reason =
        run.outcome && run.outcome.status === "failed"
          ? run.outcome.reason
          : "Hard failed";
      return {
        id: `failed:${run.id}`,
        kind: "failed_run",
        mark: (taskTitle(run.goalPreview)[0] ?? "F").toUpperCase(),
        tool: taskTitle(run.goalPreview),
        impact: firstLine(reason, 48),
        context: `${taskTitle(run.goalPreview)} · ${run.id} · ${agentLabel(run.assignee, run, agentsById)}`,
        parkedLabel: formatCompactDurationSince(run.startedAt, now),
        reviewHref: runDetailHref(run.id),
        cta: { type: "retry", taskId: run.taskId },
        ctaLabel: "Retry",
      };
    });

  return [...approvalRows, ...failedRows];
}

export function buildHomeDigest(sources: HomeDigestSources): HomeDigest {
  const now = sources.now ?? Date.now();
  const agentsById: Record<string, ManagementAgent> = {};
  for (const agent of sources.agents) {
    agentsById[agent.id] = agent;
  }

  const runsById: Record<string, RunVisibilityListItem> = {};
  for (const run of sources.runs) {
    runsById[run.id] = run;
  }

  const pending = sources.approvals.filter(
    (record) => record.status === "pending",
  );
  const parkedRunIds = new Set(
    pending.flatMap((record) => (record.runId ? [record.runId] : [])),
  );

  const liveRunsSource = sources.runs.filter(
    (run) => run.status === "running" && !parkedRunIds.has(run.id),
  );
  const completed = sources.runs.filter((run) => run.status === "completed");
  const completed24h = completed.filter((run) =>
    isWithinLast24h(run.startedAt, now),
  );
  const goalMet24h = completed24h.filter(
    (run) => run.outcome?.status === "goal_met",
  ).length;
  const failed24h = completed24h
    .filter((run) => run.outcome?.status === "failed")
    .sort(
      (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt),
    );
  const weekCompleted = completed.filter((run) => {
    const started = new Date(run.startedAt).getTime();
    return !Number.isNaN(started) && now - started <= 7 * DAY_MS;
  });
  const weekMet = weekCompleted.filter(
    (run) => run.outcome?.status === "goal_met",
  ).length;
  const weekTotal = weekCompleted.length;

  const attention = buildAttention({
    pending,
    failed24h,
    runsById,
    agentsById,
    now,
  });

  const oldestParked =
    pending.length === 0
      ? "—"
      : formatCompactDuration(
          Math.max(
            ...pending.map((record) =>
              Math.max(0, now - new Date(record.createdAt).getTime()),
            ),
          ),
        );

  const runningAgentIds = new Set(liveRunsSource.map((run) => run.assignee));
  const failedAssigneeIds = new Set(failed24h.map((run) => run.assignee));

  const recentSource = [...sources.runs].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt),
  );
  const recentRuns: HomeRecentRun[] = recentSource
    .slice(0, RECENT_LIMIT)
    .map((run) => {
      const verdict = deriveGoalVerdict(run);
      const report = sources.runReports[run.id];
      const endedAt = report?.steps.at(-1)?.timestamp;
      const durationLabel =
        verdict === "awaiting"
          ? "—"
          : endedAt
            ? formatCompactDuration(
                Math.max(
                  0,
                  new Date(endedAt).getTime() -
                    new Date(run.startedAt).getTime(),
                ),
              )
            : "—";
      return {
        id: run.id,
        task: taskTitle(run.goalPreview),
        agent: agentLabel(run.assignee, run, agentsById),
        verdict,
        durationLabel,
        whenLabel: formatHomeClock(run.startedAt),
      };
    });

  const scheduled: HomeScheduledTask[] = sources.tasks
    .filter((task) => !task.archivedAt && isScheduleTrigger(task.trigger))
    .sort((left, right) => {
      const leftNext = left.nextRunAt ?? "";
      const rightNext = right.nextRunAt ?? "";
      if (leftNext !== rightNext) {
        return leftNext.localeCompare(rightNext);
      }
      return left.id.localeCompare(right.id);
    })
    .map((task) => {
      const paused = Boolean(
        isScheduleTrigger(task.trigger) && task.trigger.paused,
      );
      const failed = Boolean(task.scheduleFailedAt);
      const agent = agentsById[task.assignee];
      return {
        id: task.id,
        task: taskTitle(task.goal),
        description: isScheduleTrigger(task.trigger)
          ? task.trigger.timezone
          : "",
        agent: agent?.name || agent?.slug || task.assignee,
        trigger: formatScheduleTrigger(task.trigger),
        lastVerdict: lastOutcomeForTask(sources.runs, task.id),
        nextLabel: formatNextRunLabel(task.nextRunAt, paused, now, failed),
        paused,
        failed,
      };
    });
  const pausedScheduledCount = scheduled.filter((row) => row.paused).length;

  const taskCountByAgent = new Map<string, number>();
  for (const task of sources.tasks) {
    taskCountByAgent.set(
      task.assignee,
      (taskCountByAgent.get(task.assignee) ?? 0) + 1,
    );
  }

  const agents: HomeAgentCard[] = [...sources.agents]
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, AGENT_STRIP_LIMIT)
    .map((agent) => ({
      id: agent.id,
      slug: agent.slug,
      name: agent.name || agent.slug,
      initials: deriveAgentInitials(agent.name || agent.slug),
      summary: agentSummary(agent.persona),
      taskLabel: formatTaskCount(taskCountByAgent.get(agent.id) ?? 0),
      toolLabel: formatToolCount(countEffectiveTools(agent, sources.groups)),
      health: agentHealth(agent.id, runningAgentIds, failedAssigneeIds),
    }));

  const failedTaskName = failed24h[0]
    ? taskTitle(failed24h[0].goalPreview)
    : null;

  return {
    subtitle: formatHomeSubtitle(attention.length, liveRunsSource.length),
    attention,
    awaitingYou: pending.length,
    oldestParkedLabel: formatOldestParkedSub(oldestParked),
    runningCount: liveRunsSource.length,
    runningAgentLabel: formatAgentCount(runningAgentIds.size),
    goalMet24h,
    partial24h: 0,
    failed24h: failed24h.length,
    failedTaskName,
    liveRuns: liveRunsSource.map((run) =>
      buildLiveRun(run, sources.runReports[run.id], agentsById, now),
    ),
    goalRateLabel:
      weekTotal === 0 ? "—" : `${Math.round((weekMet / weekTotal) * 100)}%`,
    week: buildWeek(weekCompleted, now),
    recentRuns,
    totalRunCount: sources.runs.length,
    scheduled,
    pausedScheduledCount,
    agents,
    systemMap: buildSystemMap(sources),
  };
}

export function scheduledTaskHref(taskId: string): string {
  return taskEditHref(taskId);
}
