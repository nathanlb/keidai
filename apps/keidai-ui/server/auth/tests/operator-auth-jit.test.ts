import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { createServer } from "../../create-server.js";
import { createFudaOwnerClient } from "../fuda-owner-client.js";
import type { OperatorAuthConfig } from "../types.js";
import { OPERATOR_SESSION_COOKIE } from "../session.js";

function jitAuthConfig(
  overrides: Partial<OperatorAuthConfig> = {},
): OperatorAuthConfig {
  return {
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    redirectUri: "http://127.0.0.1/auth/callback",
    sessionSecret: "test-session-secret-at-least-32-chars!!",
    operators: [],
    cookieSecure: false,
    issuer: "https://acme.okta.com",
    ...overrides,
  };
}

function firstCookiePair(setCookieHeaders: string[], name: string): string {
  const header = setCookieHeaders.find((cookie) =>
    cookie.startsWith(`${name}=`),
  );
  assert.ok(header, `missing Set-Cookie for ${name}`);
  return header.split(";")[0]!;
}

describe("JIT operator login", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let upstream: ReturnType<typeof createHttpServer>;
  let authConfig: OperatorAuthConfig;
  let active = true;

  before(async () => {
    upstream = createHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    const address = upstream.address();
    assert(address && typeof address === "object");

    authConfig = jitAuthConfig({
      exchangeAuthorizationCode: async (code) => {
        if (code === "disabled-code") {
          return { googleSub: "sub-disabled", email: "disabled@acme.com" };
        }
        return {
          googleSub: "sub-ada",
          email: "ada@acme.com",
          name: "Ada",
        };
      },
      provisionOwner: async (input) => {
        if (input.idpSub === "sub-disabled") {
          return { ok: false, reason: "disabled" };
        }
        assert.equal(input.idpIssuer, "https://acme.okta.com");
        assert.equal(input.email, "ada@acme.com");
        return { ok: true, ownerId: "ada", role: "admin" };
      },
      isOwnerActive: async (ownerId) => active && ownerId === "ada",
      getOwnerAccess: async (ownerId) => ({
        active: active && ownerId === "ada",
        role: "admin",
      }),
    });

    app = await createServer({
      auth: authConfig,
      bffServiceToken: null,
      backends: {
        torii: `http://127.0.0.1:${address.port}`,
        fuda: `http://127.0.0.1:${address.port}`,
        shaiden: `http://127.0.0.1:${address.port}`,
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
  });

  after(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
    });
  });

  function baseUrl(): string {
    const address = app.server.address();
    assert(address && typeof address === "object");
    return `http://127.0.0.1:${address.port}`;
  }

  async function callback(code: string): Promise<Response> {
    const login = await fetch(`${baseUrl()}/auth/login`, {
      redirect: "manual",
    });
    const location = login.headers.get("location");
    assert.ok(location);
    const state = new URL(location).searchParams.get("state");
    assert.ok(state);
    const oidcCookie = firstCookiePair(
      login.headers.getSetCookie(),
      "keidai_oidc_state",
    );
    return fetch(
      `${baseUrl()}/auth/callback?code=${code}&state=${encodeURIComponent(state)}`,
      { headers: { cookie: oidcCookie }, redirect: "manual" },
    );
  }

  it("provisions an owner and seals that owner id into the session", async () => {
    active = true;
    const callbackResponse = await callback("ada-code");
    assert.equal(callbackResponse.status, 302);
    const sessionCookie = firstCookiePair(
      callbackResponse.headers.getSetCookie(),
      OPERATOR_SESSION_COOKIE,
    );
    const session = await fetch(`${baseUrl()}/api/session`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), {
      googleSub: "sub-ada",
      email: "ada@acme.com",
      ownerId: "ada",
      role: "admin",
      name: "Ada",
    });
  });

  it("rejects a disabled owner at login and on a later request", async () => {
    const denied = await callback("disabled-code");
    assert.equal(denied.status, 403);
    assert.match(await denied.text(), /disabled/);

    active = true;
    const callbackResponse = await callback("ada-code");
    const sessionCookie = firstCookiePair(
      callbackResponse.headers.getSetCookie(),
      OPERATOR_SESSION_COOKIE,
    );
    active = false;
    const session = await fetch(`${baseUrl()}/api/session`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(session.status, 401);
  });

  it("caches and deduplicates Fuda owner active checks within TTL", async () => {
    let lookups = 0;
    const fudaStub = createHttpServer((_req, res) => {
      lookups += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ owner: { ownerId: "ada", status: "active" } }));
    });
    await new Promise<void>((resolve) => {
      fudaStub.listen(0, "127.0.0.1", () => resolve());
    });
    try {
      const address = fudaStub.address();
      assert(address && typeof address === "object");
      const client = createFudaOwnerClient({
        fudaBaseUrl: `http://127.0.0.1:${address.port}`,
        serviceToken: null,
        cacheTtlMs: 60_000,
      });

      const [first, second] = await Promise.all([
        client.isOwnerActive("ada"),
        client.isOwnerActive("ada"),
      ]);
      const third = await client.isOwnerActive("ada");
      assert.equal(first, true);
      assert.equal(second, true);
      assert.equal(third, true);
      assert.equal(lookups, 1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        fudaStub.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
