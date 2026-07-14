import type { Page } from "@playwright/test";
import type {
  ApprovalRecordView,
  ConfigAgentsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  ConnectionsResponse,
  OAuthConnectionsResponse,
  OAuthInitiateResponse,
  ServerToolsResponse,
  RunReport,
  RunsResponse,
  SavedTask,
  TasksResponse,
  TraceListItem,
  TraceStatsResponse,
  TracesResponse,
} from "@keidai/shared";
import { CONNECTION_SSE_EVENT, RUN_SSE_EVENT, TRACE_SSE_EVENT } from "@keidai/shared/dto";

export interface MockToriiConfig {
  agents?: ConfigAgentsResponse;
  servers?: ConfigServersResponse;
  connections?: ConnectionsResponse;
  serverTools?: Record<string, ServerToolsResponse>;
  oauthProviders?: ConfigOAuthProvidersResponse;
  oauthConnections?: Record<string, OAuthConnectionsResponse>;
  oauthInitiate?: Record<
    string,
    OAuthInitiateResponse | { status: number; error: string }
  >;
  traces?: TracesResponse;
  traceStats?: TraceStatsResponse;
  runs?: RunsResponse;
  runDetails?: Record<string, RunReport>;
  tasks?: TasksResponse;
  taskRuntime?: { agentId: string };
  approvals?: ApprovalRecordView[];
  healthy?: boolean;
  shaidenHealthy?: boolean;
  toriiVersion?: string;
  shaidenVersion?: string;
}

export async function mockToriiConfig(
  page: Page,
  {
    agents = { agents: [] },
    servers = { servers: [] },
    connections = { connections: [] },
    serverTools = {},
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
    runs = { runs: [] },
    runDetails = {},
    tasks = { tasks: [] },
    taskRuntime = { agentId: "shaiden-newsletter-01" },
    approvals = [],
    healthy = true,
    shaidenHealthy = healthy,
    toriiVersion = "0.0.0",
    shaidenVersion = "0.0.0",
  }: MockToriiConfig = {},
): Promise<void> {
  const approvalState = [...approvals];
  const taskState: SavedTask[] = [...tasks.tasks];

  await page.route("**/api/health", async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    await route.fulfill({ json: { ok: true, version: toriiVersion } });
  });

  await page.route("**/api/shaiden/health", async (route) => {
    if (!shaidenHealthy) {
      await route.fulfill({ status: 503, body: "Shaiden unavailable" });
      return;
    }

    await route.fulfill({
      json: {
        ok: true,
        version: shaidenVersion,
        agentId: taskRuntime.agentId,
      },
    });
  });

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

    const url = new URL(route.request().url());
    const toolsMatch = url.pathname.match(/\/api\/connections\/([^/]+)\/tools$/);
    if (toolsMatch) {
      const serverName = decodeURIComponent(toolsMatch[1]!);
      await route.fulfill({
        json: serverTools[serverName] ?? { tools: [] },
      });
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

  await page.route(/\/api\/runs(\?|$)/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    await route.fulfill({ json: runs });
  });

  await page.route(/\/api\/tasks\/runtime$/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    await route.fulfill({ json: taskRuntime });
  });

  await page.route(/\/api\/tasks(\?|$)/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    if (route.request().method() === "GET") {
      await route.fulfill({ json: { tasks: taskState } });
      return;
    }

    await route.continue();
  });

  await page.route(/\/api\/tasks\/([^/?]+)$/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const url = new URL(route.request().url());
    const taskId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");

    if (taskId === "runtime") {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: taskRuntime });
        return;
      }

      await route.fulfill({ status: 405, body: "Method not allowed" });
      return;
    }

    if (taskId === "run") {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 202,
          json: { runId: "run-from-task", taskId: "task-from-dialog" },
        });
        return;
      }

      await route.fulfill({ status: 405, body: "Method not allowed" });
      return;
    }

    const index = taskState.findIndex((task) => task.id === taskId);

    if (route.request().method() === "GET") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "task not found" } });
        return;
      }

      await route.fulfill({ json: { task: taskState[index] } });
      return;
    }

    if (route.request().method() === "PATCH") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "task not found" } });
        return;
      }

      const body = route.request().postDataJSON() as Partial<SavedTask>;
      const current = taskState[index]!;
      const updated: SavedTask = {
        ...current,
        ...body,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      taskState[index] = updated;
      await route.fulfill({ json: { task: updated } });
      return;
    }

    await route.continue();
  });

  await page.route(/\/api\/tasks\/run$/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    await route.fulfill({
      status: 202,
      json: { runId: "run-from-task", taskId: "task-from-dialog" },
    });
  });

  await page.route(/\/api\/tasks\/[^/?]+\/run$/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const url = new URL(route.request().url());
    const segments = url.pathname.split("/");
    const taskId = segments.at(-2) ?? "task-unknown";

    await route.fulfill({
      status: 202,
      json: { runId: "run-from-task", taskId },
    });
  });

  await page.route(/\/api\/runs\/[^/?]+/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const url = new URL(route.request().url());
    const segments = url.pathname.split("/");
    const resource = segments.at(-1);

    if (resource === "events") {
      const events = Object.values(runDetails)
        .map(
          (run) =>
            `event: ${RUN_SSE_EVENT.runUpdated}\ndata: ${JSON.stringify(run)}\n\n`,
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

    const match = runDetails[resource ?? ""];
    if (match) {
      await route.fulfill({ json: match });
      return;
    }

    await route.fulfill({ status: 404, json: { error: "run not found" } });
  });

  await page.route(/\/api\/approvals(\?|$)/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const filtered = status
      ? approvalState.filter((record) => record.status === status)
      : approvalState;
    await route.fulfill({ json: filtered });
  });

  await page.route(/\/api\/approvals\/[^/?]+\/(approve|reject|cancel)$/, async (route) => {
    if (!healthy) {
      await route.fulfill({ status: 503, body: "Gateway unavailable" });
      return;
    }

    const url = new URL(route.request().url());
    const segments = url.pathname.split("/");
    const action = segments.at(-1);
    const id = segments.at(-2) ?? "";
    const index = approvalState.findIndex((record) => record.id === id);
    if (index === -1) {
      await route.fulfill({
        status: 404,
        json: { error: "approval not found or not pending" },
      });
      return;
    }

    const current = approvalState[index]!;
    if (current.status !== "pending") {
      await route.fulfill({
        status: 404,
        json: { error: "approval not found or not pending" },
      });
      return;
    }

    const decidedAt = new Date().toISOString();
    if (action === "approve") {
      approvalState[index] = { ...current, status: "approved", decidedAt };
    } else if (action === "reject") {
      const body = route.request().postDataJSON() as { reason?: string } | null;
      approvalState[index] = {
        ...current,
        status: "rejected",
        decidedAt,
        rejectionReason: body?.reason,
      };
    } else if (action === "cancel") {
      approvalState[index] = { ...current, status: "cancelled", decidedAt };
    }

    await route.fulfill({ json: approvalState[index] });
  });
}
