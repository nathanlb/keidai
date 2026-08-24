import type { Page } from "@playwright/test";
import type {
  ApprovalRecordView,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  ConnectionsResponse,
  GroupView,
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
import type {
  Bearer,
  Grant,
  ManagementAgent,
  PersonaVersion,
} from "../../src/lib/api/agents.js";
import type { ToriiGroupDefinition } from "../../src/lib/api/gateway.js";

export interface MockToriiConfig {
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
  taskRuntime?: { ready: boolean };
  approvals?: ApprovalRecordView[];
  healthy?: boolean;
  shaidenHealthy?: boolean;
  toriiVersion?: string;
  shaidenVersion?: string;
  /** Fuda's agent registry — the UI's only source of agent data. */
  fudaAgents?: ManagementAgent[];
  fudaBearers?: Bearer[];
  fudaGrants?: Grant[];
  /** Overrides the synthesized single-version history for an agent id. */
  fudaPersonaVersions?: Record<string, PersonaVersion[]>;
  /** NAT-124 (Torii group definitions) — defaults to an empty known set. */
  toriiGroups?: ToriiGroupDefinition[];
  /** NAT-179 group policy records. When omitted, derived from `toriiGroups`. */
  toriiGroupPolicies?: GroupView[];
  fudaHealthy?: boolean;
}

export async function mockToriiConfig(
  page: Page,
  {
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
    taskRuntime = { ready: true },
    approvals = [],
    healthy = true,
    shaidenHealthy = healthy,
    toriiVersion = "0.0.0",
    shaidenVersion = "0.0.0",
    fudaAgents = [],
    fudaBearers = [],
    fudaGrants = [],
    fudaPersonaVersions = {},
    toriiGroups = [],
    toriiGroupPolicies,
    fudaHealthy = healthy,
  }: MockToriiConfig = {},
): Promise<void> {
  const approvalState = [...approvals];
  const taskState: SavedTask[] = [...tasks.tasks];
  const agentState: ManagementAgent[] = fudaAgents.map((agent) => ({
    ...agent,
  }));
  const personaState = new Map<string, PersonaVersion[]>();
  for (const agent of agentState) {
    const versions = fudaPersonaVersions[agent.id] ?? [
      {
        agentId: agent.id,
        version: agent.currentPersonaVersion,
        content: agent.persona,
        createdAt: agent.updatedAt,
      },
    ];
    personaState.set(agent.id, [...versions]);
  }
  const bearerState: Bearer[] = fudaBearers.map((bearer) => ({ ...bearer }));
  const grantState: Grant[] = fudaGrants.map((grant) => ({ ...grant }));
  const now = "2026-08-01T00:00:00.000Z";
  const groupState: GroupView[] = (
    toriiGroupPolicies ??
    toriiGroups.map((group, index) => ({
      id: `grp-${index + 1}`,
      name: group.name,
      description: group.description,
      createdAt: now,
      updatedAt: now,
      servers: [],
    }))
  ).map((group) => ({
    ...group,
    servers: group.servers.map((policy) => ({ ...policy })),
  }));

  function pickerGroups() {
    return groupState.map((group) => ({
      name: group.name,
      description: group.description,
    }));
  }

  // E2E runs Vite without the API-only BFF; fulfill a session so
  // OperatorAuthGate + useActingOwner see a valid operator principal
  // (same owner as e2e agent fixtures).
  await page.route("**/api/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        googleSub: "e2e-operator",
        email: "e2e@example.com",
        ownerId: "owner-a",
        name: "E2E Operator",
      }),
    });
  });

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
      },
    });
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
      redirectUri: `http://localhost:3000/oauth/callback/${provider}`,
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

  await page.route(/\/api\/ui\/shaiden\/runs(\?|$)/, async (route) => {
    if (!shaidenHealthy) {
      await route.fulfill({ status: 503, body: "Shaiden unavailable" });
      return;
    }

    await route.fulfill({
      json: {
        runs: runs.runs.map((run) => ({ ...run, assigneeDisplay: null })),
        agentsById: {},
      },
    });
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
      const activeTasks = taskState.filter((task) => !task.archivedAt);
      await route.fulfill({ json: { tasks: activeTasks } });
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

      const current = taskState[index]!;
      if (current.archivedAt) {
        await route.fulfill({ status: 409, json: { error: "task is archived" } });
        return;
      }

      const body = route.request().postDataJSON() as Partial<SavedTask>;
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

    if (route.request().method() === "DELETE") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "task not found" } });
        return;
      }

      const current = taskState[index]!;
      if (current.archivedAt) {
        await route.fulfill({ status: 404, json: { error: "task not found" } });
        return;
      }

      const archived: SavedTask = {
        ...current,
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      taskState[index] = archived;
      await route.fulfill({ status: 204, body: "" });
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
    const task = taskState.find((entry) => entry.id === taskId);
    if (!task) {
      await route.fulfill({ status: 404, json: { error: "task not found" } });
      return;
    }
    if (task.archivedAt) {
      await route.fulfill({ status: 409, json: { error: "task is archived" } });
      return;
    }

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

  await page.route("**/api/fuda/health", async (route) => {
    if (!fudaHealthy) {
      await route.fulfill({ status: 503, body: "Fuda unavailable" });
      return;
    }

    await route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/config/groups", async (route) => {
    await route.fulfill({ json: { groups: pickerGroups() } });
  });

  await page.route(/\/api\/groups\/[^/]+$/, async (route) => {
    const url = new URL(route.request().url());
    const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    const method = route.request().method();
    const index = groupState.findIndex((group) => group.id === id);

    if (method === "GET") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "group not found" } });
        return;
      }
      await route.fulfill({ json: { group: groupState[index] } });
      return;
    }

    if (method === "PATCH") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "group not found" } });
        return;
      }
      const body = route.request().postDataJSON() as {
        description?: string;
        servers?: GroupView["servers"];
      };
      const current = groupState[index]!;
      const next: GroupView = {
        ...current,
        description: body.description ?? current.description,
        servers: body.servers ?? current.servers,
        updatedAt: new Date().toISOString(),
      };
      groupState[index] = next;
      await route.fulfill({ json: { group: next } });
      return;
    }

    if (method === "DELETE") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "group not found" } });
        return;
      }
      groupState.splice(index, 1);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.continue();
  });

  await page.route(/\/api\/groups(\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as {
        name: string;
        description?: string;
        servers?: GroupView["servers"];
      };
      if (groupState.some((group) => group.name === body.name)) {
        await route.fulfill({
          status: 409,
          json: { error: "group name already exists" },
        });
        return;
      }
      const createdAt = new Date().toISOString();
      const group: GroupView = {
        id: `grp-${groupState.length + 1}`,
        name: body.name,
        description: body.description ?? "",
        createdAt,
        updatedAt: createdAt,
        servers: body.servers ?? [],
      };
      groupState.push(group);
      await route.fulfill({ status: 201, json: { group } });
      return;
    }

    await route.fulfill({ json: { groups: groupState } });
  });

  await page.route(/\/api\/agents\/slugs\/[^/]+\/availability$/, async (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split("/");
    const slug = decodeURIComponent(segments.at(-2) ?? "");
    const available = !agentState.some((agent) => agent.slug === slug);
    await route.fulfill({ json: { available } });
  });

  await page.route(/\/api\/agents\/[^/]+\/personas$/, async (route) => {
    const url = new URL(route.request().url());
    const agentId = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");
    const versions = [...(personaState.get(agentId) ?? [])].sort(
      (a, b) => b.version - a.version,
    );
    await route.fulfill({ json: { personas: versions } });
  });

  await page.route(/\/api\/agents\/[^/]+\/grants$/, async (route) => {
    const url = new URL(route.request().url());
    const agentId = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");
    await route.fulfill({
      json: { grants: grantState.filter((grant) => grant.agentId === agentId) },
    });
  });

  await page.route(/\/api\/agents(\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as {
        slug: string;
        name: string;
        ownerId: string;
        groups?: string[];
        persona: string;
      };
      const now = new Date().toISOString();
      const agent: ManagementAgent = {
        id: `agt-${agentState.length + 1}`,
        slug: body.slug,
        name: body.name,
        ownerId: body.ownerId,
        groups: body.groups ?? [],
        persona: body.persona,
        currentPersonaVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      agentState.push(agent);
      personaState.set(agent.id, [
        { agentId: agent.id, version: 1, content: body.persona, createdAt: now },
      ]);
      const platform = bearerState.find(
        (bearer) => bearer.bearerId === "shaiden-runner",
      );
      if (platform) {
        grantState.push({ bearerId: platform.bearerId, agentId: agent.id });
      }
      await route.fulfill({ status: 201, json: { agent } });
      return;
    }

    await route.fulfill({ json: { agents: agentState } });
  });

  await page.route(/\/api\/agents\/[^/]+$/, async (route) => {
    const url = new URL(route.request().url());
    const agentId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    const method = route.request().method();
    const index = agentState.findIndex((agent) => agent.id === agentId);

    if (method === "GET") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "agent not found" } });
        return;
      }

      await route.fulfill({ json: { agent: agentState[index] } });
      return;
    }

    if (method === "PATCH") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "agent not found" } });
        return;
      }

      const body = route.request().postDataJSON() as {
        name?: string;
        groups?: string[];
        persona?: string;
      };
      const current = agentState[index]!;
      const updatedAt = new Date().toISOString();
      const next: ManagementAgent = {
        ...current,
        name: body.name ?? current.name,
        groups: body.groups ?? current.groups,
        updatedAt,
      };

      if (body.persona !== undefined) {
        next.persona = body.persona;
        next.currentPersonaVersion = current.currentPersonaVersion + 1;
        const versions = personaState.get(agentId) ?? [];
        versions.push({
          agentId,
          version: next.currentPersonaVersion,
          content: body.persona,
          createdAt: updatedAt,
        });
        personaState.set(agentId, versions);
      }

      agentState[index] = next;
      await route.fulfill({ json: { agent: next } });
      return;
    }

    if (method === "DELETE") {
      if (index === -1) {
        await route.fulfill({ status: 404, json: { error: "agent not found" } });
        return;
      }

      agentState.splice(index, 1);
      personaState.delete(agentId);
      for (let i = grantState.length - 1; i >= 0; i -= 1) {
        if (grantState[i]!.agentId === agentId) {
          grantState.splice(i, 1);
        }
      }
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.continue();
  });

  await page.route(/\/api\/bearers(\?|$)/, async (route) => {
    await route.fulfill({ json: { bearers: bearerState } });
  });
}
