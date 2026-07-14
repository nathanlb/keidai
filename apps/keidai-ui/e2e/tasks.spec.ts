import { expect, test } from "@playwright/test";
import type { PublicAgentConfig, RunReport, SavedTask } from "@keidai/shared";
import { mockToriiConfig } from "./helpers/mock-torii.js";

const shaidenAgent: PublicAgentConfig = {
  agent_id: "shaiden-newsletter-01",
  owner_id: "nathanlb",
  subject: {
    kind: "k8s_service_account",
    namespace: "agents",
    service_account: "shaiden",
  },
  groups: [],
};

const savedTask: SavedTask = {
  id: "task-saved-1",
  goal: "Compose weekly status report",
  trigger: { type: "now" },
  assignee: shaidenAgent.agent_id,
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
};

const runFromTask: RunReport = {
  id: "run-from-task",
  taskId: "task-from-dialog",
  task: {
    goal: "Compose weekly status report",
    trigger: { type: "now" },
    assignee: shaidenAgent.agent_id,
  },
  startedAt: "2026-07-13T12:00:00.000Z",
  assignee: shaidenAgent.agent_id,
  goalPreview: "Compose weekly status report",
  status: "running",
  stepCount: 0,
  steps: [],
};

test.describe("Shaiden tasks", () => {
  test("authors a task from runs and navigates to the new run", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      agents: { agents: [shaidenAgent] },
      runDetails: { "run-from-task": runFromTask },
    });

    await page.goto("/shaiden/runs?new_task=1");

    const dialog = page.getByRole("dialog", { name: "New task" });
    await expect(dialog).toBeVisible();

    await dialog
      .getByPlaceholder(/describe what "done" looks like/i)
      .fill("Compose weekly status report");

    await dialog.getByRole("button", { name: "Create & run" }).click();

    await expect(page).toHaveURL(/\/shaiden\/runs\?run=run-from-task$/);
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("run-from-task · shaiden-newsletter-01"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Compose weekly status report" }),
    ).toBeVisible();
  });

  test("lists saved tasks and re-runs one", async ({ page }) => {
    await mockToriiConfig(page, {
      agents: { agents: [shaidenAgent] },
      tasks: { tasks: [savedTask] },
      runDetails: { "run-from-task": runFromTask },
    });

    await page.goto("/shaiden/tasks");

    await expect(
      page.getByRole("cell", { name: "Compose weekly status report" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Run" }).click();

    await expect(page).toHaveURL(/\/shaiden\/runs\?run=run-from-task$/);
  });

  test("opens the authoring dialog from the runs deep link", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      agents: { agents: [shaidenAgent] },
    });

    await page.goto("/shaiden/runs?new_task=1");

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "New task" }),
    ).toBeVisible();
  });
});
