import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import type { GroupPolicy } from "../types/group-policy.js";

function sampleGroup(name = "agents"): GroupPolicy {
  const now = new Date("2026-08-23T00:00:00.000Z");
  return {
    id: `group-${name}`,
    name,
    description: `${name} access`,
    createdAt: now,
    updatedAt: now,
    servers: [
      {
        server: "gmail",
        default: "deny",
        allow: ["create_draft", "list_drafts"],
        deny: [],
        gated: ["create_draft"],
      },
    ],
  };
}

describe("PgGroupPolicyRepository", () => {
  it("round-trips groups and per-server policy lists", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      const repository = persistence.groupPolicyRepository;
      assert.equal(await repository.isEmpty(), true);

      const stored = sampleGroup();
      await repository.insertAll([stored]);
      assert.equal(await repository.isEmpty(), false);

      const listed = await repository.list();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.name, "agents");
      assert.deepEqual(listed[0]?.servers, stored.servers);
    } finally {
      await persistence.close();
    }
  });

  it("creates, updates description and policies, and deletes", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      const repository = persistence.groupPolicyRepository;
      const created = await repository.create({
        name: "editors",
        description: "Draft access",
        servers: [
          {
            server: "gmail",
            default: "deny",
            allow: ["create_draft"],
            deny: [],
            gated: ["create_draft"],
          },
        ],
      });
      assert.equal(created.name, "editors");
      assert.equal((await repository.get(created.id))?.description, "Draft access");

      const updated = await repository.update(created.id, {
        description: "Draft and list",
        servers: [
          {
            server: "gmail",
            default: "deny",
            allow: ["create_draft", "list_drafts"],
            deny: [],
            gated: ["create_draft"],
          },
        ],
      });
      assert.equal(updated?.description, "Draft and list");
      assert.deepEqual(updated?.servers[0]?.allow, [
        "create_draft",
        "list_drafts",
      ]);
      assert.equal(updated?.name, "editors");

      assert.equal(await repository.delete(created.id), true);
      assert.equal(await repository.get(created.id), null);
      assert.equal(await repository.delete(created.id), false);
    } finally {
      await persistence.close();
    }
  });

  it("rejects duplicate names via the database unique constraint", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      const repository = persistence.groupPolicyRepository;
      await repository.create({
        name: "editors",
        description: "",
        servers: [],
      });
      await assert.rejects(
        () =>
          repository.create({
            name: "editors",
            description: "other",
            servers: [],
          }),
        /unique|duplicate/i,
      );
    } finally {
      await persistence.close();
    }
  });
});
