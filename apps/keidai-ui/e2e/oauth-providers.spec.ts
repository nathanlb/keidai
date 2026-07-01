import { expect, test } from "@playwright/test";
import { mockGatewayConfig } from "./helpers/mock-gateway.js";

test.describe("OAuth providers page", () => {
  test("shows the empty state when no providers are configured", async ({
    page,
  }) => {
    await mockGatewayConfig(page, {
      oauthProviders: { providers: {} },
    });

    await page.goto("/oauth-providers");

    await expect(page.getByText("No OAuth providers configured")).toBeVisible();
    await expect(
      page.getByText(/configure a provider such as github/i),
    ).toBeVisible();
  });

  test("lists provider config and linked owner grants", async ({ page }) => {
    await mockGatewayConfig(page, {
      agents: {
        agents: [
          {
            agent_id: "alpha",
            owner_id: "owner-a",
            subject: {
              kind: "k8s_service_account",
              namespace: "agents",
              service_account: "alpha",
            },
            groups: [],
          },
        ],
      },
      oauthProviders: {
        providers: {
          github: {
            token_url: "https://github.com/login/oauth/access_token",
            authorize_url: "https://github.com/login/oauth/authorize",
            client_id: "Iv1.public-client",
            scopes: ["repo", "read:user"],
            pkce: true,
          },
        },
      },
      oauthConnections: {
        "owner-a": {
          connections: [
            {
              provider: "github",
              ownerId: "owner-a",
              status: "linked",
              scopes: ["repo", "read:user"],
            },
          ],
        },
      },
    });

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

    await mockGatewayConfig(page, {
      agents: {
        agents: [
          {
            agent_id: "alpha",
            owner_id: "owner-a",
            subject: {
              kind: "k8s_service_account",
              namespace: "agents",
              service_account: "alpha",
            },
            groups: [],
          },
        ],
      },
      oauthProviders: {
        providers: {
          github: {
            token_url: "https://github.com/login/oauth/access_token",
            authorize_url: "https://github.com/login/oauth/authorize",
            client_id: "Iv1.public-client",
            scopes: ["repo", "read:user"],
            pkce: true,
          },
        },
      },
      oauthConnections: {
        "owner-a": {
          connections: [
            {
              provider: "github",
              ownerId: "owner-a",
              status: "not_linked",
              scopes: [],
            },
          ],
        },
      },
      oauthInitiate: {
        github: {
          authorizationUrl: "https://github.com/login/oauth/authorize?state=test",
          linkId: "link-1",
          redirectUri: "http://127.0.0.1:3100/oauth/callback/github",
        },
      },
    });

    await page.route("**/api/oauth/connections**", async (route) => {
      pollCount += 1;
      const status = pollCount >= 2 ? "linked" : "pending";
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
