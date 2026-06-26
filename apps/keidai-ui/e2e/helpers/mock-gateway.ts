import type { Page } from "@playwright/test";
import type {
  ConfigAgentsResponse,
  ConfigServersResponse,
} from "@keidai/shared";

export interface MockGatewayConfig {
  agents?: ConfigAgentsResponse;
  servers?: ConfigServersResponse;
  healthy?: boolean;
}

export async function mockGatewayConfig(
  page: Page,
  {
    agents = { agents: [] },
    servers = { servers: [] },
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
}
