import type {
  ApprovalRecordView,
  ConnectionStatus,
  GroupView,
  PublicServerConfig,
  RunReport,
  SavedTask,
} from "@keidai/shared";
import { describe, expect, it } from "vitest";
import type { ManagementAgent } from "../../../lib/api/agents.js";
import type { RunVisibilityListItem } from "../../../lib/api/runs.js";
import { buildSystemMap } from "../build-system-map.js";

const NOW = Date.parse("2026-08-24T15:00:00.000Z");

function server(
  name: string,
  strategy: PublicServerConfig["credential"]["strategy"] = "user_oauth",
): PublicServerConfig {
  return {
    name,
    transport: { type: "http", url: `https://${name}.example/mcp` },
    credential:
      strategy === "user_oauth"
        ? { strategy: "user_oauth", provider: name }
        : strategy === "service_key"
          ? { strategy: "service_key" }
          : { strategy: "none" },
    policy: { default: "deny" },
  };
}

function connection(
  name: string,
  toolCount: number,
): ConnectionStatus {
  return { name, state: "connected", toolCount };
}

function group(overrides: Partial<GroupView> = {}): GroupView {
  return {
    id: "grp-inbox",
    name: "inbox-ops",
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
    ...overrides,
  };
}

function agent(overrides: Partial<ManagementAgent> = {}): ManagementAgent {
  return {
    id: "agt-ops",
    slug: "ops-bot",
    name: "ops-bot",
    ownerId: "owner-a",
    groups: ["inbox-ops"],
    persona: "Keeps the inbox in order.",
    currentPersonaVersion: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<RunVisibilityListItem> = {}): RunVisibilityListItem {
  return {
    id: "run-live",
    taskId: "task-1",
    startedAt: new Date(NOW - 2 * 60_000).toISOString(),
    assignee: "agt-ops",
    goalPreview: "triage-inbox",
    status: "running",
    stepCount: 5,
    assigneeDisplay: null,
    ...overrides,
  };
}

function approval(
  overrides: Partial<ApprovalRecordView> = {},
): ApprovalRecordView {
  return {
    id: "appr-1",
    agentId: "agt-ops",
    ownerId: "owner-a",
    toolName: "gmail.send_email",
    params: {},
    runId: "run-parked",
    status: "pending",
    createdAt: new Date(NOW - 4 * 60_000).toISOString(),
    expiresAt: new Date(NOW + 86_400_000).toISOString(),
    ...overrides,
  };
}

function report(): RunReport {
  return {
    id: "run-live",
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
        text: "Reading unread threads",
      },
    ],
  };
}

const unusedTask: SavedTask = {
  id: "task-1",
  goal: "triage-inbox",
  trigger: { type: "now" },
  assignee: "agt-ops",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("buildSystemMap", () => {
  it("places servers, groups, and working agents from live digest sources", () => {
    const map = buildSystemMap({
      approvals: [],
      runs: [run()],
      runReports: { "run-live": report() },
      tasks: [unusedTask],
      agents: [agent()],
      groups: [group()],
      servers: [server("gmail"), server("slack")],
      connections: [connection("gmail", 11), connection("slack", 6)],
      now: NOW,
    });

    expect(map.workingCount).toBe(1);
    expect(map.servers).toEqual([
      {
        id: "gmail",
        label: "gmail",
        sub: "11 tools · oauth",
        groupId: "grp-inbox",
      },
      {
        id: "slack",
        label: "slack",
        sub: "6 tools · oauth",
        groupId: null,
      },
    ]);
    expect(map.groups[0]).toMatchObject({
      name: "inbox-ops",
      allGated: false,
      scope: "2 tools",
    });
    expect(map.agents[0]).toMatchObject({
      id: "agt-ops",
      label: "ops-bot",
      state: "working",
      task: "triage-inbox · step 1 of 12",
      meta: "2m",
      groupId: "grp-inbox",
    });
  });

  it("marks parked agents waiting and gated groups as all gated", () => {
    const billing: GroupView = group({
      id: "grp-billing",
      name: "billing-write",
      servers: [
        {
          server: "stripe",
          default: "deny",
          allow: [],
          deny: [],
          gated: ["create_invoice", "refund", "charge", "payout"],
        },
      ],
    });
    const map = buildSystemMap({
      approvals: [approval({ agentId: "agt-bill", runId: "run-parked" })],
      runs: [
        run({
          id: "run-parked",
          assignee: "agt-bill",
          goalPreview: "monthly-invoices",
          status: "running",
        }),
      ],
      runReports: {},
      tasks: [],
      agents: [
        agent({
          id: "agt-bill",
          slug: "invoicer",
          name: "invoicer",
          groups: ["billing-write"],
        }),
      ],
      groups: [billing],
      servers: [server("stripe", "service_key")],
      connections: [connection("stripe", 4)],
      now: NOW,
    });

    expect(map.groups[0]).toMatchObject({
      allGated: true,
      scope: "4 tools, all gated",
    });
    expect(map.servers[0]?.sub).toBe("4 tools · gated");
    expect(map.agents[0]).toMatchObject({
      state: "waiting",
      task: "monthly-invoices · 1 approval parked",
      meta: "4m",
    });
    expect(map.workingCount).toBe(0);
  });
});
