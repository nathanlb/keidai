import { expect, test } from "@playwright/test";
import { mockGatewayConfig } from "./helpers/mock-gateway.js";

test.describe("Torii navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockGatewayConfig(page);
  });

  test("redirects the home route to Connections", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/connections$/);
    await expect(
      page.getByText("Connection health dashboard"),
    ).toBeVisible();
  });

  test("navigates between sidebar pages", async ({ page }) => {
    await page.goto("/connections");

    await page.getByRole("link", { name: "Agents & owners" }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByText("Strict ownership")).toBeVisible();

    await page.getByRole("link", { name: "Activity & traces" }).click();
    await expect(page).toHaveURL(/\/activity$/);
    await expect(
      page.getByText("Activity and traces feed"),
    ).toBeVisible();
  });
});
