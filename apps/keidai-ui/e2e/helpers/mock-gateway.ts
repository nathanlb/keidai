import type { Page } from "@playwright/test";
import type {
  ConfigAgentsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  ConnectionsResponse,
  OAuthConnectionsResponse,
  OAuthInitiateResponse,
  TraceListItem,
  TraceStatsResponse,
  TracesResponse,
} from "@keidai/shared";
import { CONNECTION_SSE_EVENT, TRACE_SSE_EVENT } from "@keidai/shared/dto";

export interface MockGatewayConfig {
  agents?: ConfigAgentsResponse;
  servers?: ConfigServersResponse;
  connections?: ConnectionsResponse;
  oauthProviders?: ConfigOAuthProvidersResponse;
  oauthConnections?: Record<string, OAuthConnectionsResponse>;
  oauthInitiate?: Record<
    string,
    OAuthInitiateResponse | { status: number; error: string }
  >;
  traces?: TracesResponse;
  traceStats?: TraceStatsResponse;
  healthy?: boolean;
}

export async function mockGatewayConfig(
  page: Page,
  {
    agents = { agents: [] },
    servers = { servers: [] },
    connections = { connections: [] },
    oauthProviders = { providers: {} },
    oauthConnections = {},
    oauthInitiate = {},
    traces = { traces: [] },
    traceStats = {
      windowMs: 900_000,
      callsPerMinute: 0,
      successRate: 0,
      p50DurationMs: null,
      p95DurationMs: null,
      deniedCount: 0,
      linkingRequiredCount: 0,
    },
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

  await page.route("**/api/connections", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    if (route.request().method() === "POST") {
      await route.fulfill({ json: { ok: true } });
      return;
    }

    await route.fulfill({ json: connections });
  });

  await page.route("**/api/connections/**", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    if (route.request().method() === "POST") {
      await route.fulfill({ json: { ok: true } });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/connections/events", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const events = connections.connections
      .map(
        (connection) =>
          `event: ${CONNECTION_SSE_EVENT.stateChanged}\ndata: ${JSON.stringify(connection)}\n\n`,
      )
      .join("");

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
      },
      body: events,
    });
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

  await page.route("**/api/oauth/initiate/**", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const url = new URL(route.request().url());
    const provider = url.pathname.split("/").pop() ?? "";
    const response = oauthInitiate[provider] ?? {
      authorizationUrl: `https://example.com/oauth/${provider}`,
      linkId: "link-1",
      redirectUri: `http://127.0.0.1:3100/oauth/callback/${provider}`,
    };

    if ("status" in response) {
      await route.fulfill({
        status: response.status,
        json: { error: response.error },
      });
      return;
    }

    await route.fulfill({ json: response });
  });

  await page.route(/\/api\/traces(\?|$)/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    await route.fulfill({ json: traces });
  });

  await page.route(/\/api\/traces\/[^/?]+/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const url = new URL(route.request().url());
    const segments = url.pathname.split("/");
    const resource = segments.at(-1);

    if (resource === "events") {
      const events = traces.traces
        .map(
          (trace) =>
            `event: ${TRACE_SSE_EVENT.traceCreated}\ndata: ${JSON.stringify(trace)}\n\n`,
        )
        .join("");

      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
        body: events,
      });
      return;
    }

    if (resource === "stats") {
      await route.fulfill({ json: traceStats });
      return;
    }

    const match = traces.traces.find((trace) => trace.traceId === resource);
    if (match) {
      await route.fulfill({ json: match });
      return;
    }

    await route.fulfill({ status: 404, json: { error: "trace not found" } });
  });
}
