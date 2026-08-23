import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import {
  AGENTS_GROUP_NAME,
  yamlConfigToGroupPolicies,
} from "../utils/yaml-config-to-group-policies.js";

const demoConfig: ToriiConfig = {
  oauth_providers: {},
  servers: [],
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
  gated_tools: {
    "shaiden-newsletter-01": ["gmail.create_draft"],
  },
};

describe("yamlConfigToGroupPolicies", () => {
  it("maps YAML allow-lists to default-deny server policies", () => {
    const groups = yamlConfigToGroupPolicies(demoConfig);
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

  it("attaches YAML gated_tools onto the agents group's bare gated list", () => {
    const groups = yamlConfigToGroupPolicies({
      oauth_providers: {},
      servers: [],
      gated_tools: { "any-agent": ["gmail.create_draft"] },
    });
    const agents = groups.find((group) => group.name === AGENTS_GROUP_NAME);
    assert.ok(agents);
    const gmail = agents.servers.find((policy) => policy.server === "gmail");
    assert.deepEqual(gmail?.gated, ["create_draft"]);
  });
});
