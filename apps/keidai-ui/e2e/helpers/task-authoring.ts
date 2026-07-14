import { expect, type Locator } from "@playwright/test";

const goalPlaceholder = /describe what "done" looks like/i;

export function taskGoalInput(dialog: Locator): Locator {
  return dialog.getByPlaceholder(goalPlaceholder);
}

async function waitForTaskDependencies(dialog: Locator): Promise<void> {
  await expect(dialog.getByText("Loading task…")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(dialog.getByText("Loading agents…")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(dialog.getByText("Loading runtime…")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(dialog.getByText(/Could not load agents/i)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(dialog.getByText(/Could not load Shaiden runtime/i)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(dialog.getByRole("combobox")).toBeVisible({ timeout: 15_000 });
}

/** Wait until the new-task form has agents and runtime ready. */
export async function waitForNewTaskFormReady(
  dialog: Locator,
): Promise<Locator> {
  const goalInput = taskGoalInput(dialog);
  await waitForTaskDependencies(dialog);
  return goalInput;
}

/** Wait until the edit form has finished loading task, agents, and runtime. */
export async function waitForEditTaskFormReady(
  dialog: Locator,
  { expectedGoal }: { expectedGoal: string },
): Promise<Locator> {
  const goalInput = taskGoalInput(dialog);
  await waitForTaskDependencies(dialog);
  await expect(goalInput).toHaveValue(expectedGoal, { timeout: 15_000 });
  return goalInput;
}

export async function createAndRunTask(
  dialog: Locator,
  goal: string,
): Promise<void> {
  const goalInput = await waitForNewTaskFormReady(dialog);
  await goalInput.fill(goal);

  const createButton = dialog.getByRole("button", { name: "Create & run" });
  await expect(createButton).toBeEnabled({ timeout: 15_000 });
  await createButton.click();
}

export async function saveEditedTaskGoal(
  dialog: Locator,
  {
    expectedGoal,
    nextGoal,
  }: {
    expectedGoal: string;
    nextGoal: string;
  },
): Promise<void> {
  const goalInput = await waitForEditTaskFormReady(dialog, { expectedGoal });
  await goalInput.fill(nextGoal);

  const saveButton = dialog.getByRole("button", { name: "Save changes" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
}

// Backwards-compatible alias used by tasks.spec.ts
export const editTaskGoalInput = taskGoalInput;
