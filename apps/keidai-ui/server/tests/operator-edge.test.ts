import assert from "node:assert/strict";
import {
  createServer as createHttpServer,
  type IncomingMessage,
} from "node:http";
import { describe, it } from "node:test";
import { OPERATOR_OWNER_HEADER, OPERATOR_ROLE_HEADER } from "@keidai/shared";
import { createServer } from "../create-server.js";
import {
  sealOperatorSession,
  serializeSessionCookie,
} from "../auth/session.js";
import type { OperatorAuthConfig } from "../auth/types.js";
import { fetchManagementApiJson } from "../upstream/fetch-management-api.js";

function authConfig(): OperatorAuthConfig {
  return {
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    redirectUri: "http://127.0.0.1/auth/callback",
    sessionSecret: "test-session-secret-at-least-32-chars!!",
    operators: [
      {
        owner_id: "ada",
        google_sub: "sub-ada",
        google_email: "ada@example.com",
      },
    ],
    cookieSecure: false,
  };
}

describe("BFF operator context edge", () => {
  it("strips spoofed operator headers and injects the session principal", async () => {
    let seen: IncomingMessage["headers"] | undefined;
    const upstream = createHttpServer((req, res) => {
      seen = req.headers;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ agents: [] }));
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    const address = upstream.address();
    assert(address && typeof address === "object");
    const config = authConfig();
    const app = await createServer({
      auth: config,
      bffServiceToken: null,
      backends: {
        torii: `http://127.0.0.1:${address.port}`,
        fuda: `http://127.0.0.1:${address.port}`,
        shaiden: `http://127.0.0.1:${address.port}`,
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    try {
      const appAddress = app.server.address();
      assert(appAddress && typeof appAddress === "object");
      const sealed = await sealOperatorSession(
        {
          googleSub: "sub-ada",
          email: "ada@example.com",
          ownerId: "ada",
          role: "member",
        },
        config,
      );
      const cookie = serializeSessionCookie(sealed, config).split(";")[0]!;
      const response = await fetch(
        `http://127.0.0.1:${appAddress.port}/api/agents`,
        {
          headers: {
            cookie,
            [OPERATOR_OWNER_HEADER]: "spoofed",
            [OPERATOR_ROLE_HEADER]: "admin",
            "x-keidai-operator-extra": "nope",
          },
        },
      );
      assert.equal(response.status, 200);
      assert.equal(seen?.[OPERATOR_OWNER_HEADER], "ada");
      assert.equal(seen?.[OPERATOR_ROLE_HEADER], "member");
      assert.equal(seen?.["x-keidai-operator-extra"], undefined);
    } finally {
      await app.close();
      await new Promise<void>((resolve, reject) => {
        upstream.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("blocks owner provisioning and bearer mutations from browser callers", async () => {
    let bearerGets = 0;
    const upstream = createHttpServer((req, res) => {
      if (req.method === "GET" && req.url?.startsWith("/api/bearers")) {
        bearerGets += 1;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    const address = upstream.address();
    assert(address && typeof address === "object");
    const config = authConfig();
    const app = await createServer({
      auth: config,
      bffServiceToken: null,
      backends: {
        torii: `http://127.0.0.1:${address.port}`,
        fuda: `http://127.0.0.1:${address.port}`,
        shaiden: `http://127.0.0.1:${address.port}`,
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    try {
      const appAddress = app.server.address();
      assert(appAddress && typeof appAddress === "object");
      const base = `http://127.0.0.1:${appAddress.port}`;
      const sealed = await sealOperatorSession(
        {
          googleSub: "sub-ada",
          email: "ada@example.com",
          ownerId: "ada",
          role: "admin",
        },
        config,
      );
      const cookie = serializeSessionCookie(sealed, config).split(";")[0]!;
      const headers = {
        cookie,
        "content-type": "application/json",
      };

      const provision = await fetch(`${base}/api/owners/resolve-or-provision`, {
        method: "POST",
        headers,
        body: "{}",
      });
      assert.equal(provision.status, 403);

      const createBearer = await fetch(`${base}/api/bearers`, {
        method: "POST",
        headers,
        body: "{}",
      });
      assert.equal(createBearer.status, 403);

      const patchBearer = await fetch(`${base}/api/bearers/platform`, {
        method: "PATCH",
        headers,
        body: "{}",
      });
      assert.equal(patchBearer.status, 403);

      const deleteBearer = await fetch(`${base}/api/bearers/platform`, {
        method: "DELETE",
        headers,
      });
      assert.equal(deleteBearer.status, 403);

      const listBearers = await fetch(`${base}/api/bearers`, { headers });
      assert.equal(listBearers.status, 200);
      assert.equal(bearerGets, 1);
    } finally {
      await app.close();
      await new Promise<void>((resolve, reject) => {
        upstream.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("strips client operator headers on direct management fetches", async () => {
    let seen: IncomingMessage["headers"] | undefined;
    const upstream = createHttpServer((req, res) => {
      seen = req.headers;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    const address = upstream.address();
    assert(address && typeof address === "object");
    try {
      await fetchManagementApiJson(
        `http://127.0.0.1:${address.port}`,
        "/api/runs",
        {
          bffServiceToken: null,
          operator: { ownerId: "ada", role: "member" },
          headers: {
            [OPERATOR_OWNER_HEADER]: "spoofed",
            [OPERATOR_ROLE_HEADER]: "admin",
            "x-request-id": "trace-1",
          },
        },
      );
      assert.equal(seen?.[OPERATOR_OWNER_HEADER], "ada");
      assert.equal(seen?.[OPERATOR_ROLE_HEADER], "member");
      assert.equal(seen?.["x-request-id"], "trace-1");
    } finally {
      await new Promise<void>((resolve, reject) => {
        upstream.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
