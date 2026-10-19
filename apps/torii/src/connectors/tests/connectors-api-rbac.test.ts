import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { OPERATOR_OWNER_HEADER, OPERATOR_ROLE_HEADER } from "@keidai/shared";
import { ConnectorsApiController } from "../connectors-api.controller.js";
import type { ConnectorManagementService } from "../connector-management.service.js";

function operatorHeaders(ownerId: string, role: "admin" | "member") {
  return {
    [OPERATOR_OWNER_HEADER]: ownerId,
    [OPERATOR_ROLE_HEADER]: role,
  };
}

function fakeConnectors(): {
  service: ConnectorManagementService;
  calls: string[];
} {
  const calls: string[] = [];
  const service = {
    listCatalog: () => [],
    list: async () => [],
    get: async () => ({ slug: "github" }),
    installFromCatalog: async () => {
      calls.push("install");
      return { slug: "github" };
    },
    create: async () => {
      calls.push("create");
      return { slug: "custom" };
    },
    update: async () => {
      calls.push("update");
      return { slug: "custom" };
    },
    delete: async () => {
      calls.push("delete");
      return true;
    },
  };
  return { service: service as unknown as ConnectorManagementService, calls };
}

const connectorBody = {
  slug: "custom",
  displayName: "Custom",
  url: "http://127.0.0.1:9/mcp",
  authMode: "none",
};

describe("connector operator RBAC", () => {
  it("lets members read connectors and only admins mutate them", async () => {
    const { service, calls } = fakeConnectors();
    const app = Fastify({ logger: false });
    new ConnectorsApiController(service).registerRoutes(app);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const catalog = await fetch(`${baseUrl}/api/catalog/connectors`, {
        headers: operatorHeaders("ada", "member"),
      });
      assert.equal(catalog.status, 200);

      const listed = await fetch(`${baseUrl}/api/connectors`, {
        headers: operatorHeaders("ada", "member"),
      });
      assert.equal(listed.status, 200);

      const memberCreate = await fetch(`${baseUrl}/api/connectors`, {
        method: "POST",
        headers: {
          ...operatorHeaders("ada", "member"),
          "content-type": "application/json",
        },
        body: JSON.stringify(connectorBody),
      });
      assert.equal(memberCreate.status, 403);

      const memberPatch = await fetch(`${baseUrl}/api/connectors/custom`, {
        method: "PATCH",
        headers: {
          ...operatorHeaders("ada", "member"),
          "content-type": "application/json",
        },
        body: JSON.stringify({ displayName: "Renamed" }),
      });
      assert.equal(memberPatch.status, 403);

      const memberDelete = await fetch(`${baseUrl}/api/connectors/custom`, {
        method: "DELETE",
        headers: operatorHeaders("ada", "member"),
      });
      assert.equal(memberDelete.status, 403);

      const anonymousCreate = await fetch(`${baseUrl}/api/connectors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(connectorBody),
      });
      assert.equal(anonymousCreate.status, 403);
      assert.deepEqual(calls, []);

      const adminCreate = await fetch(`${baseUrl}/api/connectors`, {
        method: "POST",
        headers: {
          ...operatorHeaders("ada", "admin"),
          "content-type": "application/json",
        },
        body: JSON.stringify(connectorBody),
      });
      assert.equal(adminCreate.status, 201);

      const adminPatch = await fetch(`${baseUrl}/api/connectors/custom`, {
        method: "PATCH",
        headers: {
          ...operatorHeaders("ada", "admin"),
          "content-type": "application/json",
        },
        body: JSON.stringify({ displayName: "Renamed" }),
      });
      assert.equal(adminPatch.status, 200);

      const adminDelete = await fetch(`${baseUrl}/api/connectors/custom`, {
        method: "DELETE",
        headers: operatorHeaders("ada", "admin"),
      });
      assert.equal(adminDelete.status, 204);
      assert.deepEqual(calls, ["create", "update", "delete"]);
    } finally {
      await app.close();
    }
  });
});
