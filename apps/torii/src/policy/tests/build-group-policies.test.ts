import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENTS_GROUP_NAME,
  buildGroupPolicies,
} from "../utils/build-group-policies.js";

describe("buildGroupPolicies", () => {
  it("maps allow-lists to default-deny server policies", () => {
    const groups = buildGroupPolicies({
      groups: [
        {
          name: "agents",
          description: "Agent access",
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
        "agent-01": ["gmail.create_draft"],
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
