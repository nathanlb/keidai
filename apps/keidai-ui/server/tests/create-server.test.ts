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
