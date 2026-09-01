import { expect, test } from "@playwright/test";
import type { RunReport, SavedTask } from "@keidai/shared";
import { mockToriiConfig } from "./helpers/mock-torii.js";
import type { ManagementAgent } from "../src/lib/api/agents.js";
import {
  createAndRunTask,
  editTaskGoalInput,
  saveEditedTaskGoal,
  waitForEditTaskFormReady,
} from "./helpers/task-authoring.js";

const shaidenAgent: ManagementAgent = {
  id: "shaiden-newsletter-01",
  slug: "shaiden-newsletter-01",
  name: "Shaiden Newsletter",
  ownerId: "nathanlb",
  groups: [],
  persona: "Compose and send the weekly status newsletter.",
  currentPersonaVersion: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const savedTask: SavedTask = {
  id: "task-saved-1",
  goal: "Compose weekly status report",
  trigger: { type: "now" },
  assignee: shaidenAgent.id,
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
};

const secondSavedTask: SavedTask = {
  id: "task-saved-2",
  goal: "Draft the release notes",
  trigger: { type: "now" },
  assignee: shaidenAgent.id,
  createdAt: "2026-07-13T12:05:00.000Z",
  updatedAt: "2026-07-13T12:05:00.000Z",
};

const runningRunForSavedTask: RunReport = {
  id: "run-saved-1",
  taskId: savedTask.id,
  task: {
    goal: savedTask.goal,
    trigger: { type: "now" },
    assignee: shaidenAgent.id,
  },
  startedAt: "2026-07-13T12:10:00.000Z",
  assignee: shaidenAgent.id,
  goalPreview: savedTask.goal,
  status: "running",
  stepCount: 0,
  steps: [],
};

const runFromTask: RunReport = {
  id: "run-from-task",
  taskId: "task-from-dialog",
  task: {
    goal: "Compose weekly status report",
    trigger: { type: "now" },
    assignee: shaidenAgent.id,
  },
  startedAt: "2026-07-13T12:00:00.000Z",
  assignee: shaidenAgent.id,
  goalPreview: "Compose weekly status report",
  status: "running",
  stepCount: 0,
  steps: [],
};

test.describe("Shaiden tasks", () => {
  test("authors a task from the new-task page and navigates to the new run", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      runDetails: { "run-from-task": runFromTask },
    });

    await page.goto("/tasks/new");

    await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();
    await createAndRunTask(page, "Compose weekly status report");

    await expect(page).toHaveURL(/\/runs\/run-from-task$/);
    await expect(
      page.getByText("run-from-task · shaiden-newsletter-01"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Compose weekly status report" }),
    ).toBeVisible();
  });

  test("lists saved tasks and re-runs one", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      tasks: { tasks: [savedTask] },
      runDetails: { "run-from-task": runFromTask },
    });

    await page.goto("/tasks");

    await expect(
      page.getByRole("cell", { name: "Compose weekly status report" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Run" }).click();

    await expect(page).toHaveURL(/\/runs\/run-from-task$/);
  });

  test("starts a second saved task while another run is in flight", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      tasks: { tasks: [savedTask, secondSavedTask] },
      runs: {
        runs: [
          {
            id: runningRunForSavedTask.id,
            taskId: runningRunForSavedTask.taskId,
            startedAt: runningRunForSavedTask.startedAt,
            assignee: runningRunForSavedTask.assignee,
            goalPreview: runningRunForSavedTask.goalPreview,
            status: "running",
            stepCount: 0,
          },
        ],
      },
      runDetails: { "run-saved-1": runningRunForSavedTask },
    });

    await page.goto("/tasks");

    const runningRow = page.getByRole("row", { name: savedTask.goal });
    const idleRow = page.getByRole("row", { name: secondSavedTask.goal });

    await expect(runningRow.getByRole("button", { name: "Run" })).toBeDisabled();
    await expect(idleRow.getByRole("button", { name: "Run" })).toBeEnabled();

    await idleRow.getByRole("button", { name: "Run" }).click();

    await expect(page).toHaveURL(/\/runs\/run-from-task$/);
    await expect(
      page.getByRole("cell", { name: savedTask.goal }),
    ).toBeVisible();
  });

  test("redirects the retired runs query deep link to the new-task page", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
    });

    await page.goto("/runs?new_task=1");

    await expect(page).toHaveURL(/\/tasks\/new$/);
    await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("edits a saved task from the tasks deep link", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      tasks: { tasks: [savedTask] },
    });

    await page.goto("/tasks?task=task-saved-1");

    await expect(page).toHaveURL(/\/tasks\/task-saved-1$/);
    await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible();

    await saveEditedTaskGoal(page, {
      expectedGoal: savedTask.goal,
      nextGoal: "Compose monthly status report",
    });

    await expect(page).toHaveURL(/\/tasks\/task-saved-1$/);
    await expect(editTaskGoalInput(page)).toHaveValue(
      "Compose monthly status report",
    );
    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
  });

  test("edits a saved task from the list edit action", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      tasks: { tasks: [savedTask] },
    });

    await page.goto("/tasks");

    await page.getByRole("button", { name: "Edit" }).click();

    await expect(page).toHaveURL(/\/tasks\/task-saved-1$/);
    await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible();

    await saveEditedTaskGoal(page, {
      expectedGoal: savedTask.goal,
      nextGoal: "Compose quarterly status report",
    });

    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
  });

  test("disables save when the edit form is unchanged", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      tasks: { tasks: [savedTask] },
    });

    await page.goto("/tasks/task-saved-1");

    await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible();

    await waitForEditTaskFormReady(page, {
      expectedGoal: savedTask.goal,
    });

    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();

    const goalInput = editTaskGoalInput(page);
    await goalInput.fill("Compose monthly status report");

    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeEnabled({
      timeout: 10_000,
    });
  });

  test("leaves edit without confirmation when unchanged", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      tasks: { tasks: [savedTask] },
    });

    await page.goto("/tasks/task-saved-1");

    await waitForEditTaskFormReady(page, {
      expectedGoal: savedTask.goal,
    });

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/\/tasks$/);
    await expect(
      page.getByRole("dialog", { name: "Discard changes?" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: "Compose weekly status report" }),
    ).toBeVisible();
  });

  test("confirms before discarding dirty edits", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      tasks: { tasks: [savedTask] },
    });

    await page.goto("/tasks/task-saved-1");

    const goalInput = await waitForEditTaskFormReady(page, {
      expectedGoal: savedTask.goal,
    });

    await goalInput.fill("Unsaved edit");

    await page.getByRole("button", { name: "Cancel" }).click();

    const confirmDialog = page.getByRole("dialog", { name: "Discard changes?" });
    await expect(confirmDialog).toBeVisible();

    await confirmDialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible();
    await expect(goalInput).toHaveValue("Unsaved edit");

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).toBeVisible();

    await confirmDialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(
      page.getByRole("cell", { name: "Compose weekly status report" }),
    ).toBeVisible();
  });

  test("archives a saved task from the edit page", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [shaidenAgent],
      tasks: { tasks: [savedTask] },
    });

    await page.goto("/tasks/task-saved-1");

    await waitForEditTaskFormReady(page, {
      expectedGoal: savedTask.goal,
    });

    await page.getByRole("button", { name: "Archive" }).click();

    const confirmDialog = page.getByRole("dialog", { name: "Archive task?" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Archive task" }).click();

    await expect(page).toHaveURL(/\/tasks$/);
    await expect(
      page.getByRole("cell", { name: "Compose weekly status report" }),
    ).toHaveCount(0);
    await expect(page.getByText("No saved tasks yet")).toBeVisible();
  });
});
