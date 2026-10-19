import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPERATOR_OWNER_HEADER, OPERATOR_ROLE_HEADER } from "@keidai/shared";
import { createTestServer, sampleAgentBody } from "./test-helpers.js";

const issuer = "https://accounts.google.com";

function operatorHeaders(ownerId: string, role: "admin" | "member") {
  return {
    [OPERATOR_OWNER_HEADER]: ownerId,
    [OPERATOR_ROLE_HEADER]: role,
  };
}

function jsonHeaders(ownerId: string, role: "admin" | "member") {
  return {
    ...operatorHeaders(ownerId, role),
    "content-type": "application/json",
  };
}

async function provision(
  baseUrl: string,
  input: { idpSub: string; email: string; role?: "admin" | "member" },
): Promise<{ ownerId: string; role: string }> {
  const response = await fetch(`${baseUrl}/api/owners/resolve-or-provision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idpIssuer: issuer,
      idpSub: input.idpSub,
      email: input.email,
      ...(input.role ? { role: input.role } : {}),
    }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    owner: { ownerId: string; role: string };
  };
  return body.owner;
}

describe("operator RBAC on owners and agents", () => {
  it("bootstraps the first owner as admin and rejects member owner management", async () => {
    const server = await createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const ada = await provision(handle.baseUrl, {
        idpSub: "sub-ada",
        email: "ada@example.com",
      });
      assert.equal(ada.role, "admin");
      const bob = await provision(handle.baseUrl, {
        idpSub: "sub-bob",
        email: "bob@example.com",
      });
      assert.equal(bob.role, "member");

      const memberList = await fetch(`${handle.baseUrl}/api/owners`, {
        headers: jsonHeaders(bob.ownerId, "member"),
      });
      assert.equal(memberList.status, 403);

      const adminList = await fetch(`${handle.baseUrl}/api/owners`, {
        headers: jsonHeaders(ada.ownerId, "admin"),
      });
      assert.equal(adminList.status, 200);

      const demoteLast = await fetch(
        `${handle.baseUrl}/api/owners/${ada.ownerId}`,
        {
          method: "PATCH",
          headers: jsonHeaders(ada.ownerId, "admin"),
          body: JSON.stringify({ role: "member" }),
        },
      );
      assert.equal(demoteLast.status, 409);

      const promote = await fetch(
        `${handle.baseUrl}/api/owners/${bob.ownerId}`,
        {
          method: "PATCH",
          headers: jsonHeaders(ada.ownerId, "admin"),
          body: JSON.stringify({ role: "admin" }),
        },
      );
      assert.equal(promote.status, 200);

      const demote = await fetch(
        `${handle.baseUrl}/api/owners/${ada.ownerId}`,
        {
          method: "PATCH",
          headers: jsonHeaders(bob.ownerId, "admin"),
          body: JSON.stringify({ role: "member" }),
        },
      );
      assert.equal(demote.status, 200);

      const deleteLast = await fetch(
        `${handle.baseUrl}/api/owners/${bob.ownerId}`,
        {
          method: "DELETE",
          headers: operatorHeaders(bob.ownerId, "admin"),
        },
      );
      assert.equal(deleteLast.status, 409);
    } finally {
      await handle.close();
    }
  });

  it("lets a member mutate only their own agents", async () => {
    const server = await createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const ada = await provision(handle.baseUrl, {
        idpSub: "sub-ada",
        email: "ada-agent@example.com",
      });
      const bob = await provision(handle.baseUrl, {
        idpSub: "sub-bob",
        email: "bob-agent@example.com",
      });

      const createAda = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: jsonHeaders(ada.ownerId, "admin"),
        body: JSON.stringify({
          ...sampleAgentBody,
          ownerId: bob.ownerId,
          slug: "ada-agent",
        }),
      });
      assert.equal(createAda.status, 201);
      const adaAgent = (
        (await createAda.json()) as { agent: { id: string; ownerId: string } }
      ).agent;
      assert.equal(adaAgent.ownerId, ada.ownerId);

      const createBob = await fetch(`${handle.baseUrl}/api/agents`, {
        method: "POST",
        headers: jsonHeaders(bob.ownerId, "member"),
        body: JSON.stringify({
          ...sampleAgentBody,
          ownerId: ada.ownerId,
          slug: "bob-agent",
        }),
      });
      assert.equal(createBob.status, 201);
      const bobAgent = (
        (await createBob.json()) as { agent: { id: string; ownerId: string } }
      ).agent;
      assert.equal(bobAgent.ownerId, bob.ownerId);

      const memberPatch = await fetch(
        `${handle.baseUrl}/api/agents/${adaAgent.id}`,
        {
          method: "PATCH",
          headers: jsonHeaders(bob.ownerId, "member"),
          body: JSON.stringify({ name: "Stolen" }),
        },
      );
      assert.equal(memberPatch.status, 403);

      const ownPatch = await fetch(
        `${handle.baseUrl}/api/agents/${bobAgent.id}`,
        {
          method: "PATCH",
          headers: jsonHeaders(bob.ownerId, "member"),
          body: JSON.stringify({ name: "Bob's agent" }),
        },
      );
      assert.equal(ownPatch.status, 200);

      const adminPatch = await fetch(
        `${handle.baseUrl}/api/agents/${bobAgent.id}`,
        {
          method: "PATCH",
          headers: jsonHeaders(ada.ownerId, "admin"),
          body: JSON.stringify({ name: "Admin edit" }),
        },
      );
      assert.equal(adminPatch.status, 200);

      const memberDelete = await fetch(
        `${handle.baseUrl}/api/agents/${adaAgent.id}`,
        {
          method: "DELETE",
          headers: operatorHeaders(bob.ownerId, "member"),
        },
      );
      assert.equal(memberDelete.status, 403);

      const adminDelete = await fetch(
        `${handle.baseUrl}/api/agents/${bobAgent.id}`,
        {
          method: "DELETE",
          headers: operatorHeaders(ada.ownerId, "admin"),
        },
      );
      assert.equal(adminDelete.status, 204);
    } finally {
      await handle.close();
    }
  });
});
