import { expect, test } from "@playwright/test";
import { mockToriiConfig } from "./helpers/mock-torii.js";
import { sidebarNavLink, sidebarNavSection } from "./helpers/sidebar.js";

test.describe("App shell navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockToriiConfig(page);
  });

  test("redirects the home route to Home", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByTestId("home-all-clear")).toBeVisible();
  });

  test("swaps the full sidebar when entering and leaving Configure", async ({
    page,
  }) => {
    await page.goto("/home");

    await expect(sidebarNavSection(page, "operate")).toBeVisible();
    await expect(sidebarNavSection(page, "observe")).toBeVisible();
    await expect(sidebarNavLink(page, "/home")).toBeVisible();
    await expect(sidebarNavLink(page, "/agents")).toBeVisible();
    await expect(sidebarNavLink(page, "/tasks")).toBeVisible();
    await expect(sidebarNavLink(page, "/runs")).toBeVisible();
    await expect(sidebarNavLink(page, "/approvals")).toBeVisible();
    await expect(sidebarNavLink(page, "/activity")).toBeVisible();
    await expect(page.getByTestId("sidebar-configure-door")).toBeVisible();
    await expect(page.getByTestId("backend-health-footer")).toHaveCount(0);
    await expect(sidebarNavLink(page, "/bearers")).toHaveCount(0);

    await page.getByTestId("sidebar-configure-door").click();

    await expect(page).toHaveURL(/\/configure\/connections/);
    await expect(sidebarNavSection(page, "configure")).toBeVisible();
    await expect(sidebarNavSection(page, "operate")).toHaveCount(0);
    await expect(sidebarNavSection(page, "observe")).toHaveCount(0);
    await expect(sidebarNavLink(page, "/configure/connections")).toBeVisible();
    await expect(sidebarNavLink(page, "/configure/providers")).toBeVisible();
    await expect(sidebarNavLink(page, "/configure/groups")).toBeVisible();
    await expect(page.getByTestId("backend-health-footer")).toBeVisible();
    await expect(page.getByTestId("sidebar-configure-door")).toHaveCount(0);

    await page.getByTestId("sidebar-configure-back").click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(sidebarNavSection(page, "operate")).toBeVisible();
    await expect(sidebarNavSection(page, "observe")).toBeVisible();
  });

  test("keeps Configure mode on a hard refresh", async ({ page }) => {
    await page.goto("/configure/providers");
    await expect(sidebarNavSection(page, "configure")).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/configure\/providers$/);
    await expect(sidebarNavSection(page, "configure")).toBeVisible();
    await expect(sidebarNavLink(page, "/configure/providers")).toBeVisible();
  });

  test("redirects retired routes onto the new IA", async ({ page }) => {
    await page.goto("/connections");
    await expect(page).toHaveURL(/\/configure\/connections$/);

    await page.goto("/oauth-providers");
    await expect(page).toHaveURL(/\/configure\/providers$/);

    await page.goto("/shaiden/tasks");
    await expect(page).toHaveURL(/\/tasks$/);

    await page.goto("/shaiden/runs");
    await expect(page).toHaveURL(/\/runs$/);

    await page.goto("/bearers");
    await expect(page).toHaveURL(/\/agents$/);

    await page.goto("/bearers/br_abc123");
    await expect(page).toHaveURL(/\/agents$/);
  });

  test("navigates between workspace pages", async ({ page }) => {
    await page.goto("/home");

    await sidebarNavLink(page, "/agents").click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByText("No agents yet")).toBeVisible();

    await sidebarNavLink(page, "/activity").click();
    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.getByText("No activity yet")).toBeVisible();
  });
});
