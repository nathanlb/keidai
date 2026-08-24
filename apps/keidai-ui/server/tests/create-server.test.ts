import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { createServer } from "../create-server.js";

describe("createServer", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let torii: ReturnType<typeof createHttpServer>;
  let fuda: ReturnType<typeof createHttpServer>;
  let shaiden: ReturnType<typeof createHttpServer>;
  let toriiPort = 0;
  let fudaPort = 0;
  let shaidenPort = 0;

  before(async () => {
    torii = createHttpServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, backend: "torii" }));
        return;
      }
      if (req.url?.startsWith("/api/oauth/initiate/")) {
        const provider = req.url.split("/").pop()?.split("?")[0] ?? "unknown";
        const proto =
          String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0]?.trim() ||
          "http";
        const host =
          String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "")
            .split(",")[0]
            ?.trim() || "127.0.0.1";
        const redirectUri = `${proto}://${host}/oauth/callback/${provider}`;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            authorizationUrl: `https://example.com/oauth/${provider}`,
            linkId: "link-1",
            redirectUri,
            forwardedHost: req.headers["x-forwarded-host"] ?? null,
            forwardedProto: req.headers["x-forwarded-proto"] ?? null,
            uiOrigin: req.headers["x-torii-ui-origin"] ?? null,
          }),
        );
        return;
      }
      if (req.url?.startsWith("/oauth/callback/")) {
        res.writeHead(302, { location: "/?oauth=linked" });
        res.end();
        return;
      }
      if (req.url?.startsWith("/api/traces/events")) {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write("data: {\"type\":\"trace\"}\n\n");
        res.end();
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => {
      torii.listen(0, "127.0.0.1", () => resolve());
    });
    const toriiAddress = torii.address();
    assert(toriiAddress && typeof toriiAddress === "object");
    toriiPort = toriiAddress.port;

    fuda = createHttpServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, backend: "fuda" }));
        return;
      }
      if (req.url === "/api/agents") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ agents: [] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => {
      fuda.listen(0, "127.0.0.1", () => resolve());
    });
    const fudaAddress = fuda.address();
    assert(fudaAddress && typeof fudaAddress === "object");
    fudaPort = fudaAddress.port;

    shaiden = createHttpServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, backend: "shaiden" }));
        return;
      }
      if (req.url?.startsWith("/api/runs/events")) {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write("data: {\"type\":\"run\"}\n\n");
        res.end();
        return;
      }
      if (req.url?.startsWith("/api/runs")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ runs: [] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => {
      shaiden.listen(0, "127.0.0.1", () => resolve());
    });
    const shaidenAddress = shaiden.address();
    assert(shaidenAddress && typeof shaidenAddress === "object");
    shaidenPort = shaidenAddress.port;

    app = await createServer({
      auth: false,
      bffServiceToken: null,
      backends: {
        torii: `http://127.0.0.1:${toriiPort}`,
        fuda: `http://127.0.0.1:${fudaPort}`,
        shaiden: `http://127.0.0.1:${shaidenPort}`,
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
  });

  after(async () => {
    await app.close();
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        torii.close((error) => (error ? reject(error) : resolve()));
      }),
      new Promise<void>((resolve, reject) => {
        fuda.close((error) => (error ? reject(error) : resolve()));
      }),
      new Promise<void>((resolve, reject) => {
        shaiden.close((error) => (error ? reject(error) : resolve()));
      }),
    ]);
  });

  it("serves the SPA shell for unknown client routes", async () => {
    const address = app.server.address();
    assert(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/torii/connections`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  });

  it("proxies Torii, Fuda, and Shaiden APIs on the same origin", async () => {
    const address = app.server.address();
    assert(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const toriiHealth = await fetch(`${base}/api/health`);
    assert.equal(toriiHealth.status, 200);
    assert.deepEqual(await toriiHealth.json(), { ok: true, backend: "torii" });

    const fudaHealth = await fetch(`${base}/api/fuda/health`);
    assert.equal(fudaHealth.status, 200);
    assert.deepEqual(await fudaHealth.json(), { ok: true, backend: "fuda" });

    const agents = await fetch(`${base}/api/agents`);
    assert.equal(agents.status, 200);
    assert.deepEqual(await agents.json(), { agents: [] });

    const shaidenHealth = await fetch(`${base}/api/shaiden/health`);
    assert.equal(shaidenHealth.status, 200);
    assert.deepEqual(await shaidenHealth.json(), {
      ok: true,
      backend: "shaiden",
    });
  });

  it("proxies Torii OAuth callbacks without requiring an operator session", async () => {
    const address = app.server.address();
    assert(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${base}/oauth/callback/github?code=x&state=y`, {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/?oauth=linked");
  });

  it("forwards operator-edge Host/proto so Torii OAuth redirect_uri stays on localhost:3000", async () => {
    const address = app.server.address();
    assert(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${base}/api/oauth/initiate/github?owner=owner-a`, {
      method: "POST",
      headers: {
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "http",
        "x-torii-ui-origin": "http://localhost:3000",
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      authorizationUrl: "https://example.com/oauth/github",
      linkId: "link-1",
      redirectUri: "http://localhost:3000/oauth/callback/github",
      forwardedHost: "localhost:3000",
      forwardedProto: "http",
      uiOrigin: "http://localhost:3000",
    });
  });

  it("hardens SSE proxy responses for runs and traces events", async () => {
    const address = app.server.address();
    assert(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const runs = await fetch(`${base}/api/runs/events`);
    assert.equal(runs.status, 200);
    assert.match(runs.headers.get("cache-control") ?? "", /no-cache/);
    assert.equal(runs.headers.get("x-accel-buffering"), "no");
    assert.match(await runs.text(), /"type":"run"/);

    const traces = await fetch(`${base}/api/traces/events`);
    assert.equal(traces.status, 200);
    assert.match(traces.headers.get("cache-control") ?? "", /no-cache/);
    assert.equal(traces.headers.get("x-accel-buffering"), "no");
    assert.match(await traces.text(), /"type":"trace"/);
  });

  it("serves enriched runs visibility from the BFF UI route", async () => {
    let toriiUiHits = 0;
    const toriiBackend = createHttpServer((req, res) => {
      if (req.url?.startsWith("/api/ui/shaiden/runs")) {
        toriiUiHits += 1;
      }
      res.writeHead(404).end();
    });

    const fudaBackend = createHttpServer((req, res) => {
      if (req.url === "/api/agents") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            agents: [
              {
                id: "agent-1",
                name: "Demo Agent",
                slug: "demo-agent",
              },
            ],
          }),
        );
        return;
      }
      res.writeHead(404).end();
    });

    const shaidenBackend = createHttpServer((req, res) => {
      if (req.url === "/api/runs?limit=10") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            runs: [
              {
                id: "run-1",
                taskId: "task-1",
                startedAt: "2026-01-01T00:00:00.000Z",
                assignee: "agent-1",
                goalPreview: "Summarize inbox",
                status: "running",
                stepCount: 1,
              },
            ],
          }),
        );
        return;
      }
      res.writeHead(404).end();
    });

    await Promise.all([
      new Promise<void>((resolve) => toriiBackend.listen(0, "127.0.0.1", resolve)),
      new Promise<void>((resolve) => fudaBackend.listen(0, "127.0.0.1", resolve)),
      new Promise<void>((resolve) =>
        shaidenBackend.listen(0, "127.0.0.1", resolve),
      ),
    ]);

    const toriiAddress = toriiBackend.address();
    const fudaAddress = fudaBackend.address();
    const shaidenAddress = shaidenBackend.address();
    assert(toriiAddress && typeof toriiAddress === "object");
    assert(fudaAddress && typeof fudaAddress === "object");
    assert(shaidenAddress && typeof shaidenAddress === "object");

    const uiApp = await createServer({
      auth: false,
      bffServiceToken: null,
      backends: {
        torii: `http://127.0.0.1:${toriiAddress.port}`,
        fuda: `http://127.0.0.1:${fudaAddress.port}`,
        shaiden: `http://127.0.0.1:${shaidenAddress.port}`,
      },
    });
    await uiApp.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = uiApp.server.address();
      assert(address && typeof address === "object");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/ui/shaiden/runs?limit=10`,
      );
      assert.equal(response.status, 200);
      assert.equal(toriiUiHits, 0);

      const body = (await response.json()) as {
        runs: Array<{
          id: string;
          assigneeDisplay: { displayName: string } | null;
        }>;
        agentsById: Record<string, { displayName: string }>;
      };
      assert.equal(body.runs[0]?.id, "run-1");
      assert.equal(body.runs[0]?.assigneeDisplay?.displayName, "Demo Agent");
      assert.equal(body.agentsById["agent-1"]?.displayName, "Demo Agent");
    } finally {
      await uiApp.close();
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          toriiBackend.close((error) => (error ? reject(error) : resolve()));
        }),
        new Promise<void>((resolve, reject) => {
          fudaBackend.close((error) => (error ? reject(error) : resolve()));
        }),
        new Promise<void>((resolve, reject) => {
          shaidenBackend.close((error) => (error ? reject(error) : resolve()));
        }),
      ]);
    }
  });

  it("serves aggregated home digest from the BFF UI route", async () => {
    const toriiBackend = createHttpServer((req, res) => {
      if (req.url === "/api/approvals?limit=200") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify([
            {
              id: "approval-1",
              agentId: "agent-1",
              ownerId: "owner-a",
              toolName: "gmail.send_email",
              params: { to: "team@example.com" },
              runId: "run-parked",
              status: "pending",
              createdAt: "2026-01-01T00:00:00.000Z",
              expiresAt: "2026-01-02T00:00:00.000Z",
            },
          ]),
        );
        return;
      }
      if (req.url === "/api/groups") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ groups: [] }));
        return;
      }
      res.writeHead(404).end();
    });

    const fudaBackend = createHttpServer((req, res) => {
      if (req.url === "/api/agents") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            agents: [
              {
                id: "agent-1",
                name: "Demo Agent",
                slug: "demo-agent",
                ownerId: "owner-a",
                groups: ["ops"],
                persona: "Demo persona",
                currentPersonaVersion: 1,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          }),
        );
        return;
      }
      res.writeHead(404).end();
    });

    const shaidenBackend = createHttpServer((req, res) => {
      if (req.url === "/api/runs?limit=200") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            runs: [
              {
                id: "run-parked",
                taskId: "task-1",
                startedAt: "2026-01-01T00:00:00.000Z",
                assignee: "agent-1",
                goalPreview: "Parked task",
                status: "running",
                stepCount: 1,
              },
              {
                id: "run-live",
                taskId: "task-2",
                startedAt: "2026-01-01T00:00:00.000Z",
                assignee: "agent-1",
                goalPreview: "Live task",
                status: "running",
                stepCount: 2,
              },
            ],
          }),
        );
        return;
      }
      if (req.url === "/api/tasks?limit=200") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ tasks: [] }));
        return;
      }
      if (req.url === "/api/runs/run-live") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "run-live",
            taskId: "task-2",
            startedAt: "2026-01-01T00:00:00.000Z",
            assignee: "agent-1",
            goalPreview: "Live task",
            status: "running",
            stepCount: 2,
            task: {
              goal: "Live task",
              trigger: { type: "now" },
              assignee: "agent-1",
              limits: { max_iterations: 10, timeout_seconds: 600 },
            },
            steps: [
              {
                id: "step-1",
                kind: "model",
                timestamp: "2026-01-01T00:00:00.000Z",
                text: "Working on it",
              },
            ],
          }),
        );
        return;
      }
      res.writeHead(404).end();
    });

    await Promise.all([
      new Promise<void>((resolve) => toriiBackend.listen(0, "127.0.0.1", resolve)),
      new Promise<void>((resolve) => fudaBackend.listen(0, "127.0.0.1", resolve)),
      new Promise<void>((resolve) =>
        shaidenBackend.listen(0, "127.0.0.1", resolve),
      ),
    ]);

    const toriiAddress = toriiBackend.address();
    const fudaAddress = fudaBackend.address();
    const shaidenAddress = shaidenBackend.address();
    assert(toriiAddress && typeof toriiAddress === "object");
    assert(fudaAddress && typeof fudaAddress === "object");
    assert(shaidenAddress && typeof shaidenAddress === "object");

    const uiApp = await createServer({
      auth: false,
      bffServiceToken: null,
      backends: {
        torii: `http://127.0.0.1:${toriiAddress.port}`,
        fuda: `http://127.0.0.1:${fudaAddress.port}`,
        shaiden: `http://127.0.0.1:${shaidenAddress.port}`,
      },
    });
    await uiApp.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = uiApp.server.address();
      assert(address && typeof address === "object");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/ui/home/digest`,
      );
      assert.equal(response.status, 200);

      const body = (await response.json()) as {
        approvals: Array<{ id: string }>;
        runs: Array<{
          id: string;
          assigneeDisplay: { displayName: string } | null;
        }>;
        runReports: Record<string, { id: string }>;
        agents: Array<{ slug: string }>;
      };
      assert.equal(body.approvals.length, 1);
      assert.equal(body.runs.length, 2);
      assert.equal(body.runs[1]?.assigneeDisplay?.displayName, "Demo Agent");
      assert.equal(body.runReports["run-live"]?.id, "run-live");
      assert.equal(body.runReports["run-parked"], undefined);
      assert.equal(body.agents[0]?.slug, "demo-agent");
    } finally {
      await uiApp.close();
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          toriiBackend.close((error) => (error ? reject(error) : resolve()));
        }),
        new Promise<void>((resolve, reject) => {
          fudaBackend.close((error) => (error ? reject(error) : resolve()));
        }),
        new Promise<void>((resolve, reject) => {
          shaidenBackend.close((error) => (error ? reject(error) : resolve()));
        }),
      ]);
    }
  });

  it("injects BFF_SERVICE_TOKEN on proxied management API requests", async () => {
    let seenAuthorization: string | string[] | undefined;
    const tokenBackend = createHttpServer((req, res) => {
      seenAuthorization = req.headers.authorization;
      if (req.url === "/api/agents") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ agents: [] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => {
      tokenBackend.listen(0, "127.0.0.1", () => resolve());
    });
    const tokenAddress = tokenBackend.address();
    assert(tokenAddress && typeof tokenAddress === "object");

    const tokenApp = await createServer({
      auth: false,
      bffServiceToken: "bff-proxy-token",
      backends: {
        torii: `http://127.0.0.1:${toriiPort}`,
        fuda: `http://127.0.0.1:${tokenAddress.port}`,
        shaiden: `http://127.0.0.1:${shaidenPort}`,
      },
    });
    await tokenApp.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = tokenApp.server.address();
      assert(address && typeof address === "object");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/agents`,
      );
      assert.equal(response.status, 200);
      assert.equal(seenAuthorization, "Bearer bff-proxy-token");
    } finally {
      await tokenApp.close();
      await new Promise<void>((resolve, reject) => {
        tokenBackend.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
