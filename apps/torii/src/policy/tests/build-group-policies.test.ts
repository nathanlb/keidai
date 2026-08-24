import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENTS_GROUP_NAME,
  buildGroupPolicies,
  createDemoGroupPolicies,
} from "../utils/build-group-policies.js";

describe("buildGroupPolicies", () => {
  it("maps allow-lists to default-deny server policies", () => {
    const groups = buildGroupPolicies({
      groups: [
        {
          name: "agents",
          description: "Demo agent access for the open-torii digest scenario",
          permissions: [
            {
              server: "gmail",
              tools: ["create_draft", "list_drafts"],
            },
            {
              server: "github",
              tools: ["search_issues"],
            },
          ],
        },
      ],
      gatedTools: {
        "shaiden-newsletter-01": ["gmail.create_draft"],
      },
    });
    const agents = groups.find((group) => group.name === AGENTS_GROUP_NAME);
    assert.ok(agents);
    const gmail = agents.servers.find((policy) => policy.server === "gmail");
    assert.deepEqual(gmail, {
      server: "gmail",
      default: "deny",
      allow: ["create_draft", "list_drafts"],
      deny: [],
      gated: ["create_draft"],
    });
  });

  it("attaches gated tools onto the agents group's bare gated list", () => {
    const groups = buildGroupPolicies({
      gatedTools: { "any-agent": ["gmail.create_draft"] },
    });
    const agents = groups.find((group) => group.name === AGENTS_GROUP_NAME);
    assert.ok(agents);
    const gmail = agents.servers.find((policy) => policy.server === "gmail");
    assert.deepEqual(gmail?.gated, ["create_draft"]);
  });
});

describe("createDemoGroupPolicies", () => {
  it("includes the agents group and gmail draft gating", () => {
    const groups = createDemoGroupPolicies();
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.name, AGENTS_GROUP_NAME);
    const gmail = groups[0]?.servers.find((policy) => policy.server === "gmail");
    assert.deepEqual(gmail?.allow, ["create_draft", "list_drafts"]);
    assert.deepEqual(gmail?.gated, ["create_draft"]);
  });
});
