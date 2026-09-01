import { expect, type Page } from "@playwright/test";

const goalPlaceholder = /describe what "done" looks like/i;

export function taskGoalInput(page: Page) {
  return page.getByPlaceholder(goalPlaceholder);
}

async function waitForTaskDependencies(page: Page): Promise<void> {
  await expect(page.getByText("Loading task…")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText("Loading agents…")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText("Loading runtime…")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText(/Could not load agents/i)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(
    page.getByText(/Could not load Shaiden runtime/i),
  ).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByRole("combobox")).toBeVisible({ timeout: 15_000 });
}

/** Wait until the new-task form has agents and runtime ready. */
export async function waitForNewTaskFormReady(page: Page) {
  const goalInput = taskGoalInput(page);
  await waitForTaskDependencies(page);
  return goalInput;
}

/** Wait until the edit form has finished loading task, agents, and runtime. */
export async function waitForEditTaskFormReady(
  page: Page,
  { expectedGoal }: { expectedGoal: string },
) {
  const goalInput = taskGoalInput(page);
  await waitForTaskDependencies(page);
  await expect(goalInput).toHaveValue(expectedGoal, { timeout: 15_000 });
  return goalInput;
}

export async function createAndRunTask(
  page: Page,
  goal: string,
): Promise<void> {
  const goalInput = await waitForNewTaskFormReady(page);
  await goalInput.fill(goal);

  const createButton = page.getByRole("button", { name: "Create & run" });
  await expect(createButton).toBeEnabled({ timeout: 15_000 });
  await createButton.click();
}

export async function saveEditedTaskGoal(
  page: Page,
  {
    expectedGoal,
    nextGoal,
  }: {
    expectedGoal: string;
    nextGoal: string;
  },
): Promise<void> {
  const goalInput = await waitForEditTaskFormReady(page, { expectedGoal });
  await goalInput.fill(nextGoal);

  const saveButton = page.getByRole("button", { name: "Save changes" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
}

export const editTaskGoalInput = taskGoalInput;
