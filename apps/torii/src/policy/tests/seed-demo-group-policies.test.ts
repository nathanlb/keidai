import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-agent-principal.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import {
  evaluatePolicy,
  isGatedToolForGroups,
  isToolGrantedByAnyGroup,
} from "../utils/evaluate-policy.js";
import { seedDemoGroupPoliciesIfEmpty } from "../utils/seed-demo-group-policies.js";
import { PolicyDecision } from "@keidai/shared";

describe("seedDemoGroupPoliciesIfEmpty", () => {
  it("seeds demo policy once and gates gmail.create_draft on agents", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      const repository = persistence.groupPolicyRepository;
      const first = await seedDemoGroupPoliciesIfEmpty(repository);
      assert.equal(first.seeded, true);
      assert.equal(first.groupCount, 1);

      const second = await seedDemoGroupPoliciesIfEmpty(repository);
      assert.equal(second.seeded, false);

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
