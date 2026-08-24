import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GroupResponse, GroupsResponse } from "@keidai/shared";
import { PolicyDecision } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-agent-principal.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { GroupPolicyCache } from "../../policy/group-policy-cache.service.js";
import { PolicyEnforcementService } from "../../policy/policy-enforcement.service.js";
import { createTestGatewayHttpServer } from "./test-helpers.js";

const gmailServer = {
  name: "gmail",
  transport: { type: "http" as const, url: "http://localhost:9/mcp" },
  credential: { strategy: "none" as const },
};

const editorsBody = {
  name: "editors",
  description: "Draft access",
  servers: [
    {
      server: "gmail",
      default: "deny" as const,
      allow: ["create_draft", "list_drafts"],
      deny: [],
      gated: ["create_draft"],
    },
  ],
};

async function startGroupsGateway(cache = new GroupPolicyCache([])) {
  const configService = new ToriiConfigService({
    oauth_providers: {},
    servers: [gmailServer],
  });
  const enforcement = new PolicyEnforcementService(cache, createNoopLogger());
  const server = await createTestGatewayHttpServer({} as never, {} as never, {
    configService,
    groupPolicyCache: cache,
  });
  const gateway = await server.start();
  return { gateway, enforcement, cache };
}

describe("Gateway /api/groups", () => {
  it("creates, lists, gets, patches, and deletes a group", async () => {
    const { gateway, enforcement } = await startGroupsGateway();
    try {
      const createResponse = await fetch(`${gateway.baseUrl}/api/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editorsBody),
      });
      assert.equal(createResponse.status, 201);
      const created = (await createResponse.json()) as GroupResponse;
      assert.equal(created.group.name, "editors");
      assert.equal(created.group.description, "Draft access");
      assert.deepEqual(created.group.servers, editorsBody.servers);
      assert.equal(typeof created.group.id, "string");
      assert.equal(typeof created.group.createdAt, "string");

      const principal = { ...TEST_AGENT_PRINCIPAL, groups: ["editors"] };
      assert.equal(
        enforcement.evaluate(principal, "gmail", "create_draft").decision,
        PolicyDecision.Allowed,
      );

      const listResponse = await fetch(`${gateway.baseUrl}/api/groups`);
      assert.equal(listResponse.status, 200);
      const listed = (await listResponse.json()) as GroupsResponse;
      assert.equal(listed.groups.length, 1);
      assert.equal(listed.groups[0]?.name, "editors");

      const picker = await fetch(`${gateway.baseUrl}/api/config/groups`);
      assert.equal(picker.status, 200);
      assert.deepEqual(await picker.json(), {
        groups: [{ name: "editors", description: "Draft access" }],
      });

      const serversRes = await fetch(`${gateway.baseUrl}/api/config/servers`);
      const servers = (await serversRes.json()) as {
        servers: Array<{ policy: { default: string; allow: string[] } }>;
      };
      assert.deepEqual(servers.servers[0]?.policy, {
        default: "deny",
        allow: ["create_draft", "list_drafts"],
        gated: ["create_draft"],
      });

      const getResponse = await fetch(
        `${gateway.baseUrl}/api/groups/${created.group.id}`,
      );
      assert.equal(getResponse.status, 200);
      const got = (await getResponse.json()) as GroupResponse;
      assert.equal(got.group.id, created.group.id);

      const patchResponse = await fetch(
        `${gateway.baseUrl}/api/groups/${created.group.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            description: "Draft and send",
            servers: [
              {
                server: "gmail",
                default: "deny",
                allow: ["list_drafts"],
                deny: ["create_draft"],
                gated: [],
              },
            ],
          }),
        },
      );
      assert.equal(patchResponse.status, 200);
      const patched = (await patchResponse.json()) as GroupResponse;
      assert.equal(patched.group.name, "editors");
      assert.equal(patched.group.description, "Draft and send");
      assert.equal(
        enforcement.evaluate(principal, "gmail", "create_draft").decision,
        PolicyDecision.Denied,
      );
      assert.equal(
        enforcement.evaluate(principal, "gmail", "list_drafts").decision,
        PolicyDecision.Allowed,
      );

      const deleteResponse = await fetch(
        `${gateway.baseUrl}/api/groups/${created.group.id}`,
        { method: "DELETE" },
      );
      assert.equal(deleteResponse.status, 204);

      const missing = await fetch(
        `${gateway.baseUrl}/api/groups/${created.group.id}`,
      );
      assert.equal(missing.status, 404);

      const afterDelete = enforcement.evaluate(
        principal,
        "gmail",
        "list_drafts",
      );
      assert.equal(afterDelete.decision, PolicyDecision.Denied);
      assert.equal(afterDelete.reason, "unknown_group: editors");

      const pickerAfter = await fetch(`${gateway.baseUrl}/api/config/groups`);
      assert.deepEqual(await pickerAfter.json(), { groups: [] });
    } finally {
      await gateway.close();
    }
  });

  it("rejects duplicate names, unknown servers, overlapping lists, and rename", async () => {
    const { gateway } = await startGroupsGateway();
    try {
      const created = await fetch(`${gateway.baseUrl}/api/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editorsBody),
      });
      assert.equal(created.status, 201);
      const { group } = (await created.json()) as GroupResponse;

      const duplicate = await fetch(`${gateway.baseUrl}/api/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...editorsBody, description: "other" }),
      });
      assert.equal(duplicate.status, 409);
      assert.equal(
        ((await duplicate.json()) as { error: string }).error,
        "group name already exists",
      );

      const unknownServer = await fetch(`${gateway.baseUrl}/api/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "ops",
          servers: [
            {
              server: "linear",
              default: "deny",
              allow: ["list_issues"],
              deny: [],
              gated: [],
            },
          ],
        }),
      });
      assert.equal(unknownServer.status, 400);
      assert.match(
        ((await unknownServer.json()) as { error: string }).error,
        /unknown server "linear"/,
      );

      const overlap = await fetch(
        `${gateway.baseUrl}/api/groups/${group.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            servers: [
              {
                server: "gmail",
                default: "deny",
                allow: ["create_draft"],
                deny: ["create_draft"],
                gated: [],
              },
            ],
          }),
        },
      );
      assert.equal(overlap.status, 400);
      assert.match(
        ((await overlap.json()) as { error: string }).error,
        /allow and deny/,
      );

      const rename = await fetch(`${gateway.baseUrl}/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "other" }),
      });
      assert.equal(rename.status, 400);
      assert.equal(
        ((await rename.json()) as { error: string }).error,
        "name is immutable",
      );
    } finally {
      await gateway.close();
    }
  });
});
