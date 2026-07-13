import { expect, test } from "@playwright/test";
import {
  emptyOAuthProvidersConfig,
  linkedGitHubProvidersConfig,
  notLinkedGitHubProvidersConfig,
} from "./fixtures/oauth-providers.js";
import { mockToriiConfig } from "./helpers/mock-torii.js";

test.describe("OAuth providers page", () => {
  test("shows the empty state when no providers are configured", async ({
    page,
  }) => {
    await mockToriiConfig(page, emptyOAuthProvidersConfig);

    await page.goto("/oauth-providers");

    await expect(page.getByText("No OAuth providers configured")).toBeVisible();
    await expect(
      page.getByText(/configure a provider such as github/i),
    ).toBeVisible();
  });

  test("lists provider config and linked owner grants", async ({ page }) => {
    await mockToriiConfig(page, linkedGitHubProvidersConfig);

    await page.goto("/oauth-providers");

    await expect(page.getByText("GitHub", { exact: true })).toBeVisible();
    await expect(page.getByText("2 scopes")).toBeVisible();
    await expect(page.getByText("1 of 1 linked")).toBeVisible();

    await page.getByRole("button", { name: /GitHub/i }).click();
    await expect(page.getByText("github.com/login/oauth/authorize")).toBeVisible();
    await expect(page.getByText("valid · auto-refreshing")).toBeVisible();
  });

  test("opens the OAuth linking dialog and completes when the grant is stored", async ({
    page,
  }) => {
    let pollCount = 0;

    await mockToriiConfig(page, notLinkedGitHubProvidersConfig);

    await page.route("**/api/oauth/connections**", async (route) => {
      pollCount += 1;
      // 1: page load, 2: beginAuthorization baseline — must stay not_linked so
      // shouldAcceptLinkedOutcome does not treat the eventual linked poll as stale.
      const status =
        pollCount >= 4
          ? "linked"
          : pollCount >= 3
            ? "pending"
            : "not_linked";
      await route.fulfill({
        json: {
          connections: [
            {
              provider: "github",
              ownerId: "owner-a",
              status,
              scopes: ["repo", "read:user"],
            },
          ],
        },
      });
    });

    await page.goto("/oauth-providers");

    await page.getByRole("button", { name: "Link account", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Link GitHub" }),
    ).toBeVisible();
    await expect(page.getByText("repo")).toBeVisible();

    await page.getByRole("button", { name: "Open authorization" }).click();
    await expect(
      page.getByText("Waiting for authorization in GitHub"),
    ).toBeVisible();

    await expect(page.getByRole("dialog")).toBeHidden({
      timeout: 10_000,
    });

    await expect(page.getByText("1 of 1 linked")).toBeVisible();
    await expect(page.getByText("Linked", { exact: true })).toBeVisible();
  });
});
