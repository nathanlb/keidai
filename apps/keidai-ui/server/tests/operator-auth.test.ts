import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { createServer } from "../create-server.js";
import type { OperatorAuthConfig } from "../auth/types.js";
import {
  OPERATOR_SESSION_COOKIE,
  sealOperatorSession,
  serializeSessionCookie,
} from "../auth/session.js";

function testAuthConfig(
  overrides: Partial<OperatorAuthConfig> = {},
): OperatorAuthConfig {
  return {
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    redirectUri: "http://127.0.0.1/auth/callback",
    sessionSecret: "test-session-secret-at-least-32-chars!!",
    ownerId: "nathanlb",
    allowlist: {
      googleSubs: new Set(["allowlisted-sub"]),
      emails: new Set(["allow@example.com"]),
    },
    cookieSecure: false,
    ...overrides,
  };
}

function firstCookiePair(setCookieHeaders: string[], name: string): string {
  const header = setCookieHeaders.find((c) => c.startsWith(`${name}=`));
  assert.ok(header, `missing Set-Cookie for ${name}`);
  return header.split(";")[0]!;
}

describe("operator auth", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let upstream: ReturnType<typeof createHttpServer>;
  let upstreamPort = 0;
  let authConfig: OperatorAuthConfig;

  before(async () => {
    upstream = createHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, backend: "torii" }));
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    const address = upstream.address();
    assert(address && typeof address === "object");
    upstreamPort = address.port;

    authConfig = testAuthConfig({
      exchangeAuthorizationCode: async (code) => {
        if (code === "allow-code") {
          return { googleSub: "allowlisted-sub", email: "allow@example.com" };
        }
        if (code === "deny-code") {
          return { googleSub: "other-sub", email: "deny@example.com" };
        }
        throw new Error("unexpected code");
      },
    });

    app = await createServer({
      auth: authConfig,
      backends: {
        torii: `http://127.0.0.1:${upstreamPort}`,
        fuda: `http://127.0.0.1:${upstreamPort}`,
        shaiden: `http://127.0.0.1:${upstreamPort}`,
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

  it("rejects unauthenticated management API calls", async () => {
    const response = await fetch(`${baseUrl()}/api/health`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  });

  it("returns 401 from /api/session without a cookie", async () => {
    const response = await fetch(`${baseUrl()}/api/session`);
    assert.equal(response.status, 401);
  });

  it("returns the operator principal for a valid session cookie", async () => {
    const principal = {
      googleSub: "allowlisted-sub",
      email: "allow@example.com",
      ownerId: "nathanlb",
    };
    const sealed = await sealOperatorSession(principal, authConfig);
    const cookieHeader = serializeSessionCookie(sealed, authConfig).split(
      ";",
    )[0]!;

    const session = await fetch(`${baseUrl()}/api/session`, {
      headers: { cookie: cookieHeader },
    });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), principal);

    const agents = await fetch(`${baseUrl()}/api/agents`, {
      headers: { cookie: cookieHeader },
    });
    assert.equal(agents.status, 200);
    assert.deepEqual(await agents.json(), { ok: true, backend: "torii" });
    assert.match(cookieHeader, new RegExp(`^${OPERATOR_SESSION_COOKIE}=`));
  });

  it("starts login with a Google authorize redirect and PKCE cookie", async () => {
    const response = await fetch(`${baseUrl()}/auth/login`, {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    const location = response.headers.get("location");
    assert.ok(location);
    const url = new URL(location);
    assert.equal(url.hostname, "accounts.google.com");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.ok(url.searchParams.get("state"));
    assert.match(
      response.headers.get("set-cookie") ?? "",
      /keidai_oidc_state=/,
    );
  });

  it("rejects a non-allowlisted Google account with 403", async () => {
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

    const callback = await fetch(
      `${baseUrl()}/auth/callback?code=deny-code&state=${encodeURIComponent(state)}`,
      {
        headers: { cookie: oidcCookie },
        redirect: "manual",
      },
    );
    assert.equal(callback.status, 403);
    assert.match(await callback.text(), /Access denied/);
  });

  it("issues a session cookie for an allowlisted Google account", async () => {
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

    const callback = await fetch(
      `${baseUrl()}/auth/callback?code=allow-code&state=${encodeURIComponent(state)}`,
      {
        headers: { cookie: oidcCookie },
        redirect: "manual",
      },
    );
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/");
    const sessionCookie = firstCookiePair(
      callback.headers.getSetCookie(),
      OPERATOR_SESSION_COOKIE,
    );

    const session = await fetch(`${baseUrl()}/api/session`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), {
      googleSub: "allowlisted-sub",
      email: "allow@example.com",
      ownerId: "nathanlb",
    });
  });

  it("rejects a well-formed session cookie whose claims are not allowlisted", async () => {
    const sealed = await sealOperatorSession(
      {
        googleSub: "other-sub",
        email: "deny@example.com",
        ownerId: "nathanlb",
      },
      authConfig,
    );
    const cookieHeader = serializeSessionCookie(sealed, authConfig).split(
      ";",
    )[0]!;

    const session = await fetch(`${baseUrl()}/api/session`, {
      headers: { cookie: cookieHeader },
    });
    assert.equal(session.status, 401);

    const agents = await fetch(`${baseUrl()}/api/agents`, {
      headers: { cookie: cookieHeader },
    });
    assert.equal(agents.status, 401);
  });

  it("treats a malformed session cookie as unauthenticated (401, not 500)", async () => {
    const response = await fetch(`${baseUrl()}/api/health`, {
      headers: { cookie: `${OPERATOR_SESSION_COOKIE}=%ZZ` },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  });

  it("clears the session cookie on POST /auth/logout", async () => {
    const principal = {
      googleSub: "allowlisted-sub",
      email: "allow@example.com",
      ownerId: "nathanlb",
    };
    const sealed = await sealOperatorSession(principal, authConfig);
    const cookieHeader = serializeSessionCookie(sealed, authConfig).split(
      ";",
    )[0]!;

    const logout = await fetch(`${baseUrl()}/auth/logout`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      redirect: "manual",
    });
    assert.equal(logout.status, 302);
    assert.equal(logout.headers.get("location"), "/?signed_out=1");
    const cleared = logout.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${OPERATOR_SESSION_COOKIE}=`));
    assert.ok(cleared);
    assert.match(cleared, /Max-Age=0/i);

    // GET is not registered (SPA fallback may still 200) — must not clear session.
    const getLogout = await fetch(`${baseUrl()}/auth/logout`, {
      method: "GET",
      headers: { cookie: cookieHeader },
      redirect: "manual",
    });
    assert.equal(getLogout.status, 200);
    assert.equal(
      getLogout.headers
        .getSetCookie()
        .some((c) => c.startsWith(`${OPERATOR_SESSION_COOKIE}=`)),
      false,
    );
    const stillAuthed = await fetch(`${baseUrl()}/api/session`, {
      headers: { cookie: cookieHeader },
    });
    assert.equal(stillAuthed.status, 200);
  });
});

