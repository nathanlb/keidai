import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { PLATFORM_BEARER_ID } from "../../bearers/platform-bearer.js";
import {
  TOKEN_EXCHANGE_AUDIENCE,
  TOKEN_EXCHANGE_TTL_SECONDS,
} from "../../token-exchange/constants.js";
import { createTestServer, sampleAgentBody } from "./test-helpers.js";

const SUBJECT_TOKEN = "test-secret";
const ISSUER = "https://fuda.test";

async function seedGrantedAgent(baseUrl: string): Promise<string> {
  const createAgent = await fetch(`${baseUrl}/api/agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sampleAgentBody),
  });
  assert.equal(createAgent.status, 201);
  const { agent } = (await createAgent.json()) as { agent: { id: string } };
  return agent.id;
}

describe("token exchange", () => {
  it("mints a signed JWT with pinned claims that verifies against JWKS", async () => {
    const server = await createTestServer("management,agent,public");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const agentId = await seedGrantedAgent(handle.baseUrl);

      const response = await fetch(`${handle.baseUrl}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject_token: SUBJECT_TOKEN,
          agent_id: agentId,
        }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
      };
      assert.equal(body.token_type, "Bearer");
      assert.equal(body.expires_in, TOKEN_EXCHANGE_TTL_SECONDS);
      assert.equal(typeof body.access_token, "string");

      const jwks = createRemoteJWKSet(
        new URL(`${handle.baseUrl}/.well-known/jwks.json`),
      );
      const verified = await jwtVerify(body.access_token, jwks, {
        issuer: ISSUER,
        audience: TOKEN_EXCHANGE_AUDIENCE,
      });
      assert.equal(verified.payload.agent_id, agentId);
      assert.equal(verified.payload.owner_id, sampleAgentBody.ownerId);
      assert.deepEqual(verified.payload.groups, sampleAgentBody.groups);
      assert.equal(verified.payload.bearer_id, PLATFORM_BEARER_ID);
      assert.equal(verified.payload.aud, TOKEN_EXCHANGE_AUDIENCE);
      assert.equal(verified.payload.iss, ISSUER);
      assert.ok(typeof verified.payload.exp === "number");
      assert.ok(typeof verified.payload.iat === "number");
      assert.equal(
        verified.payload.exp! - verified.payload.iat!,
        TOKEN_EXCHANGE_TTL_SECONDS,
      );
    } finally {
      await handle.close();
    }
  });

  it("rejects an invalid subject token with 401", async () => {
    const server = await createTestServer("management,agent");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const agentId = await seedGrantedAgent(handle.baseUrl);

      const response = await fetch(`${handle.baseUrl}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject_token: "wrong-secret",
          agent_id: agentId,
        }),
      });
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, "invalid subject token");
    } finally {
      await handle.close();
    }
  });

  it("rejects an ungranted agent with 403, distinct from invalid subject", async () => {
    const server = await createTestServer("management,agent");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const createAgent = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleAgentBody),
      });
      const { agent } = (await createAgent.json()) as { agent: { id: string } };

      const revoke = await fetch(
        `${handle.baseUrl}/api/bearers/${PLATFORM_BEARER_ID}/grants/${agent.id}`,
        { method: "DELETE" },
      );
      assert.equal(revoke.status, 204);

      const response = await fetch(`${handle.baseUrl}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject_token: SUBJECT_TOKEN,
          agent_id: agent.id,
        }),
      });
      assert.equal(response.status, 403);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, "bearer not granted for agent");
      assert.notEqual(body.error, "invalid subject token");
    } finally {
      await handle.close();
    }
  });

  it("rejects an unknown agent_id with 404", async () => {
    const server = await createTestServer("management,agent");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject_token: SUBJECT_TOKEN,
          agent_id: "does-not-exist",
        }),
      });
      assert.equal(response.status, 404);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, "agent not found");
    } finally {
      await handle.close();
    }
  });

  it("rejects malformed requests with 400", async () => {
    const server = await createTestServer("agent");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject_token: SUBJECT_TOKEN }),
      });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, "invalid token exchange request");
    } finally {
      await handle.close();
    }
  });

  it("is registered on the agent route group only", async () => {
    const managementOnly = await createTestServer("management");
    const managementHandle = await managementOnly.start({
      host: "127.0.0.1",
      port: 0,
    });
    try {
      const missing = await fetch(`${managementHandle.baseUrl}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject_token: SUBJECT_TOKEN,
          agent_id: "x",
        }),
      });
      assert.equal(missing.status, 404);
    } finally {
      await managementHandle.close();
    }
  });
});
