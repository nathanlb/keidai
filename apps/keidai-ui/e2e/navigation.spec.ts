import { expect, test } from "@playwright/test";
import { mockGatewayConfig } from "./helpers/mock-gateway.js";
import { sidebarNavLink, sidebarNavSection } from "./helpers/sidebar.js";

test.describe("Torii navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockGatewayConfig(page);
  });

  test("redirects the home route to Connections", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/connections$/);
    await expect(
      page.getByText("Backend connection health for the gateway."),
    ).toBeVisible();
  });

  test("navigates between sidebar pages", async ({ page }) => {
    await page.goto("/connections");

    await page.getByRole("link", { name: "Agents & owners" }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByText("Strict ownership")).toBeVisible();

    await page.getByRole("link", { name: "Activity & traces" }).click();
    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.getByText("No activity yet")).toBeVisible();
  });

  test("shows the Shaiden tasks and runs sections in the sidebar", async ({
    page,
  }) => {
    await page.goto("/connections");

    await expect(sidebarNavSection(page, "shaiden")).toBeVisible();
    await sidebarNavLink(page, "/shaiden/tasks").click();
    await expect(page).toHaveURL(/\/shaiden\/runs\?new_task=1$/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "New task" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create & run" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/shaiden\/runs$/);

    await sidebarNavLink(page, "/shaiden/runs").click();
    await expect(page).toHaveURL(/\/shaiden\/runs$/);
    await expect(
      page.getByText(
        "Step sequence, tool calls, and termination outcome for each harness run.",
      ),
    ).toBeVisible();
    await expect(page.getByText("No runs yet")).toBeVisible();
  });
});
