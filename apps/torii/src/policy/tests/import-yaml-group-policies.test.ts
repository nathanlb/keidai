import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-agent-principal.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import {
  evaluatePolicy,
  isGatedToolForGroups,
  isToolGrantedByAnyGroup,
} from "../utils/evaluate-policy.js";
import { importYamlGroupPoliciesIfEmpty } from "../utils/import-yaml-group-policies.js";
import { PolicyDecision } from "@keidai/shared";

const demoYamlConfig: ToriiConfig = {
  oauth_providers: {},
  servers: [],
  groups: [
    {
      name: "agents",
      description: "Demo agent access for the open-torii digest scenario",
      permissions: [
        { server: "gmail", tools: ["create_draft", "list_drafts"] },
        { server: "github", tools: ["search_issues", "get_file_contents"] },
      ],
    },
  ],
  gated_tools: {
    "shaiden-newsletter-01": ["gmail.create_draft"],
  },
};

describe("importYamlGroupPoliciesIfEmpty", () => {
  it("imports demo YAML once and gates gmail.create_draft on agents", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      const repository = persistence.groupPolicyRepository;
      const first = await importYamlGroupPoliciesIfEmpty(
        repository,
        demoYamlConfig,
      );
      assert.equal(first.imported, true);
      assert.equal(first.groupCount, 1);

      const second = await importYamlGroupPoliciesIfEmpty(
        repository,
        demoYamlConfig,
      );
      assert.equal(second.imported, false);

      const groups = await repository.list();
      assert.equal(
        evaluatePolicy(
          TEST_AGENT_PRINCIPAL,
          groups,
          "gmail",
          "create_draft",
        ).decision,
        PolicyDecision.Allowed,
      );
      assert.equal(
        isGatedToolForGroups(
          TEST_AGENT_PRINCIPAL,
          groups,
          "gmail",
          "create_draft",
        ),
        true,
      );
      assert.equal(
        isToolGrantedByAnyGroup(groups, "gmail", "create_draft"),
        true,
      );
    } finally {
      await persistence.close();
    }
  });
});
