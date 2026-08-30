import { expect, test } from "@playwright/test";
import type { ApprovalRecordView, RunListItem, RunReport } from "@keidai/shared";
import { mockToriiConfig } from "./helpers/mock-torii.js";
import type { ManagementAgent } from "../src/lib/api/agents.js";

const opsBot: ManagementAgent = {
  id: "agt-ops",
  slug: "ops-bot",
  name: "ops-bot",
  ownerId: "owner-a",
  groups: ["ops-write"],
  persona: "Keeps the ops sheet and support inbox in order.",
  currentPersonaVersion: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const pendingApproval: ApprovalRecordView = {
  id: "approval-home-1",
  agentId: opsBot.id,
  ownerId: "owner-a",
  toolName: "gmail.send_email",
  params: { to: "team@example.com" },
  runId: "run-parked-home",
  status: "pending",
  createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
};

const parkedRun: RunListItem = {
  id: "run-parked-home",
  taskId: "task-newsletter",
  startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  assignee: opsBot.id,
  goalPreview: "weekly-newsletter",
  status: "running",
  stepCount: 3,
};

const liveRun: RunListItem = {
  id: "run-live-home",
  taskId: "task-inbox",
  startedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  assignee: opsBot.id,
  goalPreview: "triage-inbox",
  status: "running",
  stepCount: 5,
};

const liveRunReport: RunReport = {
  ...liveRun,
  task: {
    goal: "triage-inbox",
    trigger: { type: "now" },
    assignee: opsBot.id,
    limits: { max_iterations: 12, timeout_seconds: 600 },
  },
  steps: [
    {
      id: "step-1",
      kind: "model",
      timestamp: new Date().toISOString(),
      text: "Reading 18 unread threads, drafting labels",
    },
  ],
};

test.describe("Home dashboard", () => {
  test("shows the all-clear band and an empty system map", async ({ page }) => {
    await mockToriiConfig(page);
    await page.goto("/home");

    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByTestId("home-all-clear")).toBeVisible();
    await expect(page.getByText("Nothing is blocked. 0 runs in flight.")).toBeVisible();
    await expect(page.getByTestId("home-stat-awaiting")).toContainText("0");
    await expect(page.getByTestId("home-system-map")).toBeVisible();
    await expect(page.getByText("nothing running")).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect a server" })).toBeVisible();
    await expect(page.getByTestId("system-map-fuda")).toBeVisible();
    await expect(page.getByTestId("system-map-health-torii")).toBeVisible();
    await expect(page.getByTestId("system-map-health-shaiden")).toBeVisible();
    await expect(page.getByTestId("system-map-health-fuda")).toBeVisible();
    await expect(page.getByTestId("sidebar-ecosystem-version")).toHaveText(
      "v0.0.0",
    );
  });

  test("lists a pending approval and approves it inline", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [opsBot],
      approvals: [pendingApproval],
      runs: { runs: [parkedRun] },
    });
    await page.goto("/home");

    await expect(page.getByTestId("home-needs-you")).toBeVisible();
    await expect(page.getByText("send_email")).toBeVisible();
    await expect(page.getByText("Sends to team@example.com")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved — run resumed.")).toBeVisible();
    await expect(page.getByTestId("home-all-clear")).toBeVisible();
  });

  test("shows a live run on the system map and deep-links Review into Approvals", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [opsBot],
      approvals: [pendingApproval],
      runs: { runs: [parkedRun, liveRun] },
      runDetails: { "run-live-home": liveRunReport },
      toriiGroupPolicies: [
        {
          id: "grp-ops",
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
        },
      ],
      servers: {
        servers: [
          {
            name: "gmail",
            transport: { type: "http", url: "http://gmail.example/mcp" },
            credential: { strategy: "user_oauth", provider: "gmail" },
            policy: { default: "deny" },
          },
        ],
      },
      connections: {
        connections: [{ name: "gmail", state: "connected", toolCount: 11 }],
      },
    });
    await page.goto("/home");

    await expect(page.getByTestId("home-system-map")).toBeVisible();
    await expect(page.getByText("1 agent working")).toBeVisible();
    await expect(page.getByText(/triage-inbox · step 1 of 12/)).toBeVisible();
    await expect(page.getByTestId("home-stat-running")).toContainText("1");
    await expect(page.getByText("Running now")).toHaveCount(0);

    await page.getByRole("link", { name: "Review" }).click();
    await expect(page).toHaveURL(/\/approvals\?approval=approval-home-1/);
  });

  test("opens a connection from a system map server tile", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [opsBot],
      toriiGroupPolicies: [
        {
          id: "grp-ops",
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
        },
      ],
      servers: {
        servers: [
          {
            name: "gmail",
            transport: { type: "http", url: "http://gmail.example/mcp" },
            credential: { strategy: "user_oauth", provider: "gmail" },
            policy: { default: "deny" },
          },
        ],
      },
      connections: {
        connections: [{ name: "gmail", state: "connected", toolCount: 11 }],
      },
    });
    await page.goto("/home");

    await page.getByTestId("system-map-server-gmail").click();
    await expect(page).toHaveURL(/\/connections\?server=gmail/);
    await expect(page.getByRole("heading", { name: "gmail" })).toBeVisible();
  });

  test("opens New agent and New task from the header", async ({ page }) => {
    await mockToriiConfig(page, { fudaAgents: [opsBot] });
    await page.goto("/home");

    await page.getByRole("link", { name: "New agent" }).click();
    await expect(page).toHaveURL(/\/agents\/new$/);

    await page.goto("/home");
    await page.getByRole("link", { name: "New task" }).click();
    await expect(page).toHaveURL(/\/tasks\?new_task=1/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "New task" }),
    ).toBeVisible();
  });
});
