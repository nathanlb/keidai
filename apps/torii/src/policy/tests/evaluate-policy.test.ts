import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentPrincipal, GroupDefinitionConfig } from "@keidai/shared";
import { PolicyDecision } from "@keidai/shared";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-agent-principal.js";
import { testAgentsGroup } from "../../testing/test-config.js";
import { evaluatePolicy } from "../utils/evaluate-policy.js";

const principal: AgentPrincipal = TEST_AGENT_PRINCIPAL;

describe("evaluatePolicy", () => {
  it("allows tools granted to the principal's group", () => {
    const groups: GroupDefinitionConfig[] = [
      testAgentsGroup([{ server: "github", tools: ["search_issues"] }]),
    ];
    assert.equal(
      evaluatePolicy(principal, groups, "github", "search_issues").decision,
      PolicyDecision.Allowed,
    );
  });

  it("denies tools not granted to the principal's group", () => {
    const groups: GroupDefinitionConfig[] = [
      testAgentsGroup([{ server: "github", tools: ["search_issues"] }]),
    ];
    const evaluation = evaluatePolicy(
      principal,
      groups,
      "github",
      "merge_pull_request",
    );
    assert.equal(evaluation.decision, PolicyDecision.Denied);
    assert.equal(evaluation.reason, "policy denied");
  });

  it("denies when the group is not defined at all (fail closed)", () => {
    const evaluation = evaluatePolicy(principal, [], "github", "search_issues");
    assert.equal(evaluation.decision, PolicyDecision.Denied);
  });

  it("denies and reports unknown groups on the principal", () => {
    const unknownGroupPrincipal: AgentPrincipal = {
      ...principal,
      groups: ["ghost-group"],
    };
    const groups: GroupDefinitionConfig[] = [
      testAgentsGroup([{ server: "github", tools: ["search_issues"] }]),
    ];
    const evaluation = evaluatePolicy(
      unknownGroupPrincipal,
      groups,
      "github",
      "search_issues",
    );
    assert.equal(evaluation.decision, PolicyDecision.Denied);
    assert.equal(evaluation.reason, "unknown_group: ghost-group");
  });

  it("denies when the principal has no groups", () => {
    const noGroupsPrincipal: AgentPrincipal = { ...principal, groups: [] };
    const groups: GroupDefinitionConfig[] = [
      testAgentsGroup([{ server: "github", tools: ["search_issues"] }]),
    ];
    const evaluation = evaluatePolicy(
      noGroupsPrincipal,
      groups,
      "github",
      "search_issues",
    );
    assert.equal(evaluation.decision, PolicyDecision.Denied);
  });

  it("denies when principal is undefined", () => {
    const groups: GroupDefinitionConfig[] = [
      testAgentsGroup([{ server: "github", tools: ["search_issues"] }]),
    ];
    const evaluation = evaluatePolicy(undefined, groups, "github", "search_issues");
    assert.equal(evaluation.decision, PolicyDecision.Denied);
  });
});
