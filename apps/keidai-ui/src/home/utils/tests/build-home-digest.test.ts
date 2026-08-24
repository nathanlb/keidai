import type {
  ApprovalRecordView,
  GroupView,
  RunReport,
  SavedTask,
} from "@keidai/shared";
import { describe, expect, it } from "vitest";
import type { ManagementAgent } from "../../../lib/api/agents.js";
import type { RunVisibilityListItem } from "../../../lib/api/runs.js";
import { buildHomeDigest } from "../build-home-digest.js";

const NOW = Date.parse("2026-08-24T15:00:00.000Z");

function approval(
  overrides: Partial<ApprovalRecordView> = {},
): ApprovalRecordView {
  return {
    id: "appr-1",
    agentId: "agt-ops",
    ownerId: "owner-a",
    toolName: "gmail.send_email",
    params: { to: "team@example.com" },
    runId: "run-parked",
    status: "pending",
    createdAt: new Date(NOW - 4 * 60_000).toISOString(),
    expiresAt: new Date(NOW + DAY).toISOString(),
    ...overrides,
  };
}

const DAY = 86_400_000;

function run(
  overrides: Partial<RunVisibilityListItem> = {},
): RunVisibilityListItem {
  return {
    id: "run-1",
    taskId: "task-1",
    startedAt: new Date(NOW - 2 * 60_000).toISOString(),
    assignee: "agt-ops",
    goalPreview: "triage-inbox",
    status: "running",
    stepCount: 5,
    assigneeDisplay: {
      id: "agt-ops",
      name: "ops-bot",
      slug: "ops-bot",
      displayName: "ops-bot",
      initials: "OB",
    },
    ...overrides,
  };
}

function agent(
  overrides: Partial<ManagementAgent> = {},
): ManagementAgent {
  return {
    id: "agt-ops",
    slug: "ops-bot",
    name: "ops-bot",
    ownerId: "owner-a",
    groups: ["ops-write"],
    persona: "Keeps the ops sheet and support inbox in order.",
    currentPersonaVersion: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<SavedTask> = {}): SavedTask {
  return {
    id: "task-1",
    goal: "triage-inbox",
    trigger: { type: "now" },
    assignee: "agt-ops",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const opsWrite: GroupView = {
  id: "grp-1",
  name: "ops-write",
  description: "",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  servers: [
    {
      server: "gmail",
      default: "deny",
      allow: ["messages.list"],
      deny: [],
      gated: ["send_email"],
    },
  ],
};

function report(runId: string, text: string): RunReport {
  return {
    id: runId,
    taskId: "task-1",
    startedAt: new Date(NOW - 2 * 60_000).toISOString(),
    assignee: "agt-ops",
    goalPreview: "triage-inbox",
    status: "running",
    stepCount: 2,
    task: {
      goal: "triage-inbox",
      trigger: { type: "now" },
      assignee: "agt-ops",
      limits: { max_iterations: 12, timeout_seconds: 600 },
    },
    steps: [
      {
        id: "s1",
        kind: "model",
        timestamp: new Date(NOW - 30_000).toISOString(),
        text,
      },
    ],
  };
}

describe("buildHomeDigest", () => {
  it("builds a needs-you queue from pending approvals and failed runs", () => {
    const digest = buildHomeDigest({
      approvals: [approval()],
      runs: [
        run({ id: "run-parked", status: "running" }),
        run({
          id: "run-fail",
          taskId: "task-sync",
          goalPreview: "sync-crm",
          status: "completed",
          outcome: { status: "failed", reason: "Slack token expired" },
          startedAt: new Date(NOW - 3_600_000).toISOString(),
          stepCount: 2,
        }),
      ],
      runReports: {},
      tasks: [task()],
      agents: [agent()],
      groups: [opsWrite],
      now: NOW,
    });

    expect(digest.attention).toHaveLength(2);
    expect(digest.attention[0]?.tool).toBe("send_email");
    expect(digest.attention[0]?.impact).toBe("Sends to team@example.com");
    expect(digest.attention[0]?.ctaLabel).toBe("Approve");
    expect(digest.attention[1]?.ctaLabel).toBe("Retry");
    expect(digest.subtitle).toMatch(/2 things want your decision/);
    expect(digest.awaitingYou).toBe(1);
    expect(digest.failed24h).toBe(1);
    expect(digest.failedTaskName).toBe("sync-crm");
  });

  it("excludes parked runs from the live running set", () => {
    const digest = buildHomeDigest({
      approvals: [approval({ runId: "run-parked" })],
      runs: [
        run({ id: "run-parked", status: "running" }),
        run({ id: "run-live", status: "running", stepCount: 2 }),
      ],
      runReports: {
        "run-live": report("run-live", "Reading 18 unread threads"),
      },
      tasks: [task()],
      agents: [agent()],
      groups: [opsWrite],
      now: NOW,
    });

    expect(digest.runningCount).toBe(1);
    expect(digest.liveRuns).toHaveLength(1);
    expect(digest.liveRuns[0]?.stepText).toBe("Reading 18 unread threads");
    expect(digest.liveRuns[0]?.iterationLabel).toBe("1 / 12");
    expect(digest.runningAgentLabel).toBe("1 agent");
  });

  it("computes 24h goal stats and a 7-day rate from real outcomes", () => {
    const digest = buildHomeDigest({
      approvals: [],
      runs: [
        run({
          id: "run-met",
          status: "completed",
          outcome: { status: "goal_met" },
          startedAt: new Date(NOW - 60_000).toISOString(),
        }),
        run({
          id: "run-miss",
          status: "completed",
          outcome: { status: "timeout" },
          startedAt: new Date(NOW - 120_000).toISOString(),
        }),
      ],
      runReports: {},
      tasks: [],
      agents: [agent()],
      groups: [],
      now: NOW,
    });

    expect(digest.attention).toHaveLength(0);
    expect(digest.subtitle).toBe("Nothing is blocked. 0 runs in flight.");
    expect(digest.goalMet24h).toBe(1);
    expect(digest.partial24h).toBe(0);
    expect(digest.goalRateLabel).toBe("50%");
    expect(digest.recentRuns[0]?.verdict).toBe("met");
    expect(digest.recentRuns[1]?.verdict).toBe("missed");
  });

  it("summarizes agents with task, tool, and health signals", () => {
    const digest = buildHomeDigest({
      approvals: [],
      runs: [
        run({
          id: "run-fail",
          assignee: "agt-ops",
          status: "completed",
          outcome: { status: "failed", reason: "boom" },
          startedAt: new Date(NOW - 60_000).toISOString(),
        }),
      ],
      runReports: {},
      tasks: [task(), task({ id: "task-2" })],
      agents: [agent()],
      groups: [opsWrite],
      now: NOW,
    });

    expect(digest.agents).toHaveLength(1);
    expect(digest.agents[0]?.taskLabel).toBe("2 tasks");
    expect(digest.agents[0]?.toolLabel).toBe("2 tools");
    expect(digest.agents[0]?.health).toBe("failing");
    expect(digest.scheduled).toEqual([]);
  });
});
