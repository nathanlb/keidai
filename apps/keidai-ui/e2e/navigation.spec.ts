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

  test("shows one Work then Gateway sidebar on every route", async ({
    page,
  }) => {
    await page.goto("/home");

    await expect(sidebarNavSection(page, "work")).toBeVisible();
    await expect(sidebarNavSection(page, "gateway")).toBeVisible();
    await expect(sidebarNavLink(page, "/home")).toBeVisible();
    await expect(sidebarNavLink(page, "/agents")).toBeVisible();
    await expect(sidebarNavLink(page, "/tasks")).toBeVisible();
    await expect(sidebarNavLink(page, "/runs")).toBeVisible();
    await expect(sidebarNavLink(page, "/approvals")).toBeVisible();
    await expect(sidebarNavLink(page, "/activity")).toBeVisible();
    await expect(sidebarNavLink(page, "/connections")).toBeVisible();
    await expect(sidebarNavLink(page, "/groups")).toBeVisible();
    await expect(page.getByTestId("backend-health-footer")).toBeVisible();
    await expect(page.getByTestId("sidebar-configure-door")).toHaveCount(0);
    await expect(sidebarNavLink(page, "/bearers")).toHaveCount(0);

    await page.goto("/groups");

    await expect(page).toHaveURL(/\/groups$/);
    await expect(sidebarNavSection(page, "work")).toBeVisible();
    await expect(sidebarNavSection(page, "gateway")).toBeVisible();
    await expect(sidebarNavLink(page, "/groups")).toBeVisible();
    await expect(page.getByTestId("backend-health-footer")).toBeVisible();
  });

  test("redirects /configure/groups onto /groups without swapping the sidebar", async ({
    page,
  }) => {
    await page.goto("/configure/groups");

    await expect(page).toHaveURL(/\/groups$/);
    await expect(sidebarNavSection(page, "work")).toBeVisible();
    await expect(sidebarNavSection(page, "gateway")).toBeVisible();
    await expect(sidebarNavLink(page, "/groups")).toBeVisible();
    await expect(page.getByTestId("backend-health-footer")).toBeVisible();
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
