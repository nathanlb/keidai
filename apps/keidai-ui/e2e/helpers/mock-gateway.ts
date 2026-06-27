import type { Page } from "@playwright/test";
import type {
  ConfigAgentsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  OAuthConnectionsResponse,
} from "@keidai/shared";

export interface MockGatewayConfig {
  agents?: ConfigAgentsResponse;
  servers?: ConfigServersResponse;
  oauthProviders?: ConfigOAuthProvidersResponse;
  oauthConnections?: Record<string, OAuthConnectionsResponse>;
  healthy?: boolean;
}

export async function mockGatewayConfig(
  page: Page,
  {
    agents = { agents: [] },
    servers = { servers: [] },
    oauthProviders = { providers: {} },
    oauthConnections = {},
    healthy = true,
  }: MockGatewayConfig = {},
): Promise<void> {
  await page.route("**/api/config/agents", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    await route.fulfill({ json: agents });
  });

  await page.route("**/api/config/servers", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    await route.fulfill({ json: servers });
  });

  await page.route("**/api/config/oauth-providers", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    await route.fulfill({ json: oauthProviders });
  });

  await page.route("**/api/oauth/connections**", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const url = new URL(route.request().url());
    const ownerId = url.searchParams.get("owner") ?? "";
    const response = oauthConnections[ownerId] ?? { connections: [] };
    await route.fulfill({ json: response });
  });
}
