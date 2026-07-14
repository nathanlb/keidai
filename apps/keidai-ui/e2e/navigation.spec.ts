import { expect, test } from "@playwright/test";
import { mockToriiConfig } from "./helpers/mock-torii.js";
import { sidebarNavLink, sidebarNavSection } from "./helpers/sidebar.js";

test.describe("Torii navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockToriiConfig(page);
  });

  test("redirects the home route to Connections", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/connections$/);
    await expect(
      page.getByText("Backend connection health for Torii."),
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
    await expect(sidebarNavLink(page, "/shaiden/tasks")).toBeVisible();
    await expect(sidebarNavLink(page, "/shaiden/runs")).toBeVisible();

    await sidebarNavLink(page, "/shaiden/tasks").click();

    await expect(page).toHaveURL("/shaiden/tasks");

    await sidebarNavLink(page, "/shaiden/runs").click();

    await expect(page).toHaveURL("/shaiden/runs");
  });
});
