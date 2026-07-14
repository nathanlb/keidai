import { expect, type Locator } from "@playwright/test";

const goalPlaceholder = /describe what "done" looks like/i;

export function editTaskGoalInput(dialog: Locator): Locator {
  return dialog.getByPlaceholder(goalPlaceholder);
}

/** Wait until the edit form has finished loading task, agents, and runtime. */
export async function waitForEditTaskFormReady(
  dialog: Locator,
  { expectedGoal }: { expectedGoal: string },
): Promise<Locator> {
  const goalInput = editTaskGoalInput(dialog);

  await expect(goalInput).toHaveValue(expectedGoal, { timeout: 10_000 });
  await expect(dialog.getByText("Loading task…")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(dialog.getByText("Loading agents…")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(dialog.getByText("Loading runtime…")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(dialog.getByRole("combobox")).toBeVisible({ timeout: 10_000 });

  return goalInput;
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
  await expect(saveButton).toBeEnabled({ timeout: 10_000 });
  await saveButton.click();
}
