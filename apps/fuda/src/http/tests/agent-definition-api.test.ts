import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestServer, sampleAgentBody } from "./test-helpers.js";

describe("agent definition view", () => {
  it("returns definition fields without identity fields", async () => {
    const server = createTestServer("management,agent");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const createResponse = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleAgentBody),
      });
      const { agent } = (await createResponse.json()) as {
        agent: { id: string };
      };

      const response = await fetch(`${handle.baseUrl}/agents/${agent.id}`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as Record<string, unknown>;
      assert.deepEqual(Object.keys(body).sort(), [
        "name",
        "persona",
        "personaVersion",
        "slug",
      ]);
      assert.equal(body.name, sampleAgentBody.name);
      assert.equal(body.slug, sampleAgentBody.slug);
      assert.equal(body.persona, sampleAgentBody.persona);
      assert.equal(body.personaVersion, 1);
      assert.equal("ownerId" in body, false);
      assert.equal("owner_id" in body, false);
      assert.equal("groups" in body, false);
    } finally {
      await handle.close();
    }
  });

  it("is registered on the agent route group, not management", async () => {
    const managementOnly = createTestServer("management");
    const managementHandle = await managementOnly.start({
      host: "127.0.0.1",
      port: 0,
    });
    try {
      const createResponse = await fetch(
        `${managementHandle.baseUrl}/api/agents`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sampleAgentBody),
        },
      );
      const { agent } = (await createResponse.json()) as {
        agent: { id: string };
      };

      const missing = await fetch(
        `${managementHandle.baseUrl}/agents/${agent.id}`,
      );
      assert.equal(missing.status, 404);
    } finally {
      await managementHandle.close();
    }

    const agentOnly = createTestServer("agent");
    const agentHandle = await agentOnly.start({ host: "127.0.0.1", port: 0 });
    try {
      const missingAgent = await fetch(
        `${agentHandle.baseUrl}/agents/does-not-exist`,
      );
      assert.equal(missingAgent.status, 404);
      const body = (await missingAgent.json()) as { error: string };
      assert.equal(body.error, "agent not found");

      const managementCreate = await fetch(
        `${agentHandle.baseUrl}/api/agents`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sampleAgentBody),
        },
      );
      assert.equal(managementCreate.status, 404);
    } finally {
      await agentHandle.close();
    }
  });
});
