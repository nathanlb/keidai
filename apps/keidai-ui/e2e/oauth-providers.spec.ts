import { expect, test } from "@playwright/test";
import { mockToriiConfig } from "./helpers/mock-torii.js";

test.describe("OAuth providers redirect", () => {
  test("sends /configure/providers to Connections", async ({ page }) => {
    await mockToriiConfig(page);
    await page.goto("/configure/providers");
    await expect(page).toHaveURL(/\/connections$/);
  });
});
