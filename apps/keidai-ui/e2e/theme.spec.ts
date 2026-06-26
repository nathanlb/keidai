import { expect, test } from "@playwright/test";
import { mockGatewayConfig } from "./helpers/mock-gateway.js";

test.describe("Theme toggle", () => {
  test.beforeEach(async ({ page }) => {
    await mockGatewayConfig(page);
  });

  test("switches between light and dark themes", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("keidai-ui-theme", "dark");
    });

    await page.goto("/connections");

    const root = page.locator("html");
    await expect(root).toHaveClass(/dark/);

    const toggle = page.getByRole("button", { name: "Switch to light theme" });
    await toggle.click();

    await expect(root).not.toHaveClass(/dark/);
    await expect(
      page.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeVisible();
  });
});
