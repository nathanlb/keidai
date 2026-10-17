import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestServer, sampleAgentBody } from "./test-helpers.js";

describe("owners management API", () => {
  it("provisions on first login, keeps the id, and disables the session owner", async () => {
    const server = await createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const first = await fetch(
        `${handle.baseUrl}/api/owners/resolve-or-provision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idpIssuer: "https://acme.okta.com",
            idpSub: "okta-1",
            email: "ada@acme.com",
            displayName: "Ada",
          }),
        },
      );
      assert.equal(first.status, 200);
      const created = (await first.json()) as {
        owner: { ownerId: string; email: string };
      };
      assert.equal(created.owner.ownerId, "ada");

      const second = await fetch(
        `${handle.baseUrl}/api/owners/resolve-or-provision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idpIssuer: "https://acme.okta.com",
            idpSub: "okta-1",
            email: "ada.lovelace@acme.com",
          }),
        },
      );
      assert.equal(second.status, 200);
      const renamed = (await second.json()) as {
        owner: { ownerId: string; email: string };
      };
      assert.equal(renamed.owner.ownerId, "ada");
      assert.equal(renamed.owner.email, "ada.lovelace@acme.com");

      const disable = await fetch(`${handle.baseUrl}/api/owners/ada`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      });
      assert.equal(disable.status, 200);

      const denied = await fetch(
        `${handle.baseUrl}/api/owners/resolve-or-provision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idpIssuer: "https://acme.okta.com",
            idpSub: "okta-1",
            email: "ada.lovelace@acme.com",
          }),
        },
      );
      assert.equal(denied.status, 403);
      assert.deepEqual(await denied.json(), {
        error: "owner disabled",
        ownerId: "ada",
      });
    } finally {
      await handle.close();
    }
  });

  it("deletes an owner and that owner's agents", async () => {
    const server = await createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const provision = await fetch(
        `${handle.baseUrl}/api/owners/resolve-or-provision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idpIssuer: "https://accounts.google.com",
            idpSub: "sub-1",
            email: "owner@example.com",
            ownerId: sampleAgentBody.ownerId,
          }),
        },
      );
      assert.equal(provision.status, 200);

      const agent = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sampleAgentBody),
      });
      assert.equal(agent.status, 201);
      const { agent: created } = (await agent.json()) as {
        agent: { id: string };
      };

      const deleted = await fetch(
        `${handle.baseUrl}/api/owners/${sampleAgentBody.ownerId}`,
        { method: "DELETE" },
      );
      assert.equal(deleted.status, 200);
      const body = (await deleted.json()) as {
        agentsDeleted: number;
        oauthGrantsWiped: boolean;
      };
      assert.equal(body.agentsDeleted, 1);
      assert.equal(body.oauthGrantsWiped, false);

      const missingAgent = await fetch(
        `${handle.baseUrl}/api/agents/${created.id}`,
      );
      assert.equal(missingAgent.status, 404);
      const missingOwner = await fetch(
        `${handle.baseUrl}/api/owners/${sampleAgentBody.ownerId}`,
      );
      assert.equal(missingOwner.status, 404);
    } finally {
      await handle.close();
    }
  });
});
