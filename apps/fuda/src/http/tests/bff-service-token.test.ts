import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bffServiceTokenAuthorizationHeader } from "@keidai/shared/bff-service-token";
import { createTestServer, sampleAgentBody } from "./test-helpers.js";

const TOKEN = "fuda-bff-service-token";

describe("Fuda BFF service token gate", () => {
  afterEach(() => {
    delete process.env.BFF_SERVICE_TOKEN;
    process.env.BFF_SERVICE_TOKEN_DISABLED = "true";
  });

  it("rejects management API calls without a valid token", async () => {
    delete process.env.BFF_SERVICE_TOKEN_DISABLED;
    process.env.BFF_SERVICE_TOKEN = TOKEN;
    const server = createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const unauthorized = await fetch(`${handle.baseUrl}/api/agents`);
      assert.equal(unauthorized.status, 401);

      const wrong = await fetch(`${handle.baseUrl}/api/agents`, {
        headers: {
          authorization: bffServiceTokenAuthorizationHeader("wrong"),
        },
      });
      assert.equal(wrong.status, 401);

      const ok = await fetch(`${handle.baseUrl}/api/agents`, {
        headers: {
          authorization: bffServiceTokenAuthorizationHeader(TOKEN),
        },
      });
      assert.equal(ok.status, 200);

      const create = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: bffServiceTokenAuthorizationHeader(TOKEN),
        },
        body: JSON.stringify(sampleAgentBody),
      });
      assert.equal(create.status, 201);

      const health = await fetch(`${handle.baseUrl}/api/health`);
      assert.equal(health.status, 200);
    } finally {
      await handle.close();
    }
  });

  it("leaves agent token exchange off the service-token gate", async () => {
    delete process.env.BFF_SERVICE_TOKEN_DISABLED;
    process.env.BFF_SERVICE_TOKEN = TOKEN;
    const server = createTestServer("management,agent,public");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      // Missing subject credentials → 401 from token exchange, not the BFF gate.
      const response = await fetch(`${handle.baseUrl}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: "missing",
          subject_token: "nope",
        }),
      });
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error?: string };
      assert.notEqual(body.error, "Unauthorized");

      const jwks = await fetch(`${handle.baseUrl}/.well-known/jwks.json`);
      assert.equal(jwks.status, 200);
    } finally {
      await handle.close();
    }
  });
});
