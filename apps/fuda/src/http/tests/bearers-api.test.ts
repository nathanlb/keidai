import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLATFORM_BEARER_ID } from "../../bearers/platform-bearer.js";
import { createTestServer, sampleAgentBody } from "./test-helpers.js";

describe("bearers management API", () => {
  it("creates bearers and manages grants", async () => {
    const server = await createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const agentResponse = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleAgentBody),
      });
      const { agent } = (await agentResponse.json()) as {
        agent: { id: string };
      };

      const createBearer = await fetch(`${handle.baseUrl}/api/bearers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bearerId: "ci-runner",
          displayName: "CI runner",
        }),
      });
      assert.equal(createBearer.status, 201);

      const grantResponse = await fetch(
        `${handle.baseUrl}/api/bearers/ci-runner/grants`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agentId: agent.id }),
        },
      );
      assert.equal(grantResponse.status, 201);
      const { grant } = (await grantResponse.json()) as {
        grant: { bearerId: string; agentId: string };
      };
      assert.deepEqual(grant, { bearerId: "ci-runner", agentId: agent.id });

      const bearerGet = await fetch(`${handle.baseUrl}/api/bearers/ci-runner`);
      assert.equal(bearerGet.status, 200);
      const bearerBody = (await bearerGet.json()) as {
        grants: Array<{ agentId: string }>;
      };
      assert.equal(bearerBody.grants.length, 1);

      const agentGrants = await fetch(
        `${handle.baseUrl}/api/agents/${agent.id}/grants`,
      );
      assert.equal(agentGrants.status, 200);

      const revoke = await fetch(
        `${handle.baseUrl}/api/bearers/ci-runner/grants/${agent.id}`,
        { method: "DELETE" },
      );
      assert.equal(revoke.status, 204);

      const deleteBearer = await fetch(
        `${handle.baseUrl}/api/bearers/ci-runner`,
        { method: "DELETE" },
      );
      assert.equal(deleteBearer.status, 204);
    } finally {
      await handle.close();
    }
  });

  it("returns conflict for duplicate bearer ids", async () => {
    const server = await createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      await fetch(`${handle.baseUrl}/api/bearers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bearerId: "ci-runner",
          displayName: "CI runner",
        }),
      });
      const duplicate = await fetch(`${handle.baseUrl}/api/bearers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bearerId: "ci-runner",
          displayName: "Other",
        }),
      });
      assert.equal(duplicate.status, 409);
      assert.equal(
        ((await duplicate.json()) as { error: string }).error,
        "bearer already exists",
      );
    } finally {
      await handle.close();
    }
  });

  it("rejects deleting the platform bearer", async () => {
    const server = await createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(
        `${handle.baseUrl}/api/bearers/${PLATFORM_BEARER_ID}`,
        { method: "DELETE" },
      );
      assert.equal(response.status, 409);
      assert.equal(
        ((await response.json()) as { error: string }).error,
        "platform bearer cannot be deleted",
      );
    } finally {
      await handle.close();
    }
  });
});
