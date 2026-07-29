import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestServer, sampleAgentBody } from "./test-helpers.js";

describe("agents management API", () => {
  it("creates, lists, gets, patches, and deletes agents", async () => {
    const server = createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const createResponse = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleAgentBody),
      });
      assert.equal(createResponse.status, 201);
      const created = (await createResponse.json()) as {
        agent: {
          id: string;
          slug: string;
          name: string;
          ownerId: string;
          groups: string[];
          persona: string;
          currentPersonaVersion: number;
        };
      };
      assert.equal(created.agent.slug, sampleAgentBody.slug);
      assert.equal(created.agent.ownerId, sampleAgentBody.ownerId);
      assert.deepEqual(created.agent.groups, ["editors"]);
      assert.equal(created.agent.persona, sampleAgentBody.persona);
      assert.equal(created.agent.currentPersonaVersion, 1);

      const listResponse = await fetch(`${handle.baseUrl}/api/agents`);
      assert.equal(listResponse.status, 200);
      const listed = (await listResponse.json()) as { agents: unknown[] };
      assert.equal(listed.agents.length, 1);

      const getResponse = await fetch(
        `${handle.baseUrl}/api/agents/${created.agent.id}`,
      );
      assert.equal(getResponse.status, 200);
      const got = (await getResponse.json()) as {
        agent: { ownerId: string; groups: string[] };
      };
      assert.equal(got.agent.ownerId, "owner-1");
      assert.deepEqual(got.agent.groups, ["editors"]);

      const patchResponse = await fetch(
        `${handle.baseUrl}/api/agents/${created.agent.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Weekly newsletter",
            groups: ["editors", "ops"],
            persona: "Keep it under 500 words.",
          }),
        },
      );
      assert.equal(patchResponse.status, 200);
      const patched = (await patchResponse.json()) as {
        agent: {
          name: string;
          slug: string;
          groups: string[];
          persona: string;
          currentPersonaVersion: number;
        };
      };
      assert.equal(patched.agent.name, "Weekly newsletter");
      assert.equal(patched.agent.slug, sampleAgentBody.slug);
      assert.deepEqual(patched.agent.groups, ["editors", "ops"]);
      assert.equal(patched.agent.persona, "Keep it under 500 words.");
      assert.equal(patched.agent.currentPersonaVersion, 2);

      const deleteResponse = await fetch(
        `${handle.baseUrl}/api/agents/${created.agent.id}`,
        { method: "DELETE" },
      );
      assert.equal(deleteResponse.status, 204);

      const missing = await fetch(
        `${handle.baseUrl}/api/agents/${created.agent.id}`,
      );
      assert.equal(missing.status, 404);
    } finally {
      await handle.close();
    }
  });

  it("returns a usable conflict error for duplicate slug", async () => {
    const server = createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleAgentBody),
      });

      const duplicate = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...sampleAgentBody,
          name: "Other",
        }),
      });
      assert.equal(duplicate.status, 409);
      const body = (await duplicate.json()) as { error: string };
      assert.equal(body.error, "agent slug already exists");
    } finally {
      await handle.close();
    }
  });

  it("rejects immutable slug and ownerId updates", async () => {
    const server = createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const createResponse = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleAgentBody),
      });
      const { agent } = (await createResponse.json()) as { agent: { id: string } };

      const slugPatch = await fetch(
        `${handle.baseUrl}/api/agents/${agent.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug: "other" }),
        },
      );
      assert.equal(slugPatch.status, 400);
      assert.equal(
        ((await slugPatch.json()) as { error: string }).error,
        "slug is immutable",
      );

      const ownerPatch = await fetch(
        `${handle.baseUrl}/api/agents/${agent.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ownerId: "other-owner" }),
        },
      );
      assert.equal(ownerPatch.status, 400);
      assert.equal(
        ((await ownerPatch.json()) as { error: string }).error,
        "ownerId is immutable",
      );
    } finally {
      await handle.close();
    }
  });

  it("leaves prior persona versions intact after a persona patch", async () => {
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

      await fetch(`${handle.baseUrl}/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: "Version two." }),
      });

      const definition = await fetch(`${handle.baseUrl}/agents/${agent.id}`);
      assert.equal(definition.status, 200);
      const body = (await definition.json()) as {
        persona: string;
        personaVersion: number;
      };
      assert.equal(body.persona, "Version two.");
      assert.equal(body.personaVersion, 2);
    } finally {
      await handle.close();
    }
  });
});
