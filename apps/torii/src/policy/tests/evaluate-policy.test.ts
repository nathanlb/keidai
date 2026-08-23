import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentPrincipal } from "@keidai/shared";
import { PolicyDecision } from "@keidai/shared";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-agent-principal.js";
import type {
  GroupPolicySnapshot,
  GroupServerPolicy,
} from "../types/group-policy.js";
import {
  evaluatePolicy,
  isGatedToolForGroups,
  isToolGrantedByAnyGroup,
} from "../utils/evaluate-policy.js";

const principal: AgentPrincipal = TEST_AGENT_PRINCIPAL;

function serverPolicy(
  server: string,
  overrides: Partial<GroupServerPolicy> = {},
): GroupServerPolicy {
  return {
    server,
    default: "deny",
    allow: [],
    deny: [],
    gated: [],
    ...overrides,
  };
}

function agentsGroup(
  servers: GroupServerPolicy[],
  name = "agents",
): GroupPolicySnapshot {
  return { name, servers };
}

describe("evaluatePolicy", () => {
  it("allows tools on the principal's group allow list", () => {
    const groups = [
      agentsGroup([
        serverPolicy("github", { allow: ["search_issues"] }),
      ]),
    ];
    assert.equal(
      evaluatePolicy(principal, groups, "github", "search_issues").decision,
      PolicyDecision.Allowed,
    );
  });

  it("denies tools not granted to the principal's group", () => {
    const groups = [
      agentsGroup([
        serverPolicy("github", { allow: ["search_issues"] }),
      ]),
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
    const groups = [
      agentsGroup([
        serverPolicy("github", { allow: ["search_issues"] }),
      ]),
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
    const groups = [
      agentsGroup([
        serverPolicy("github", { allow: ["search_issues"] }),
      ]),
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
    const groups = [
      agentsGroup([
        serverPolicy("github", { allow: ["search_issues"] }),
      ]),
    ];
    const evaluation = evaluatePolicy(
      undefined,
      groups,
      "github",
      "search_issues",
    );
    assert.equal(evaluation.decision, PolicyDecision.Denied);
  });

  it("lets deny win over allow on the same group", () => {
    const groups = [
      agentsGroup([
        serverPolicy("github", {
          allow: ["search_issues"],
          deny: ["search_issues"],
        }),
      ]),
    ];
    const evaluation = evaluatePolicy(
      principal,
      groups,
      "github",
      "search_issues",
    );
    assert.equal(evaluation.decision, PolicyDecision.Denied);
  });

  it("grants tools not on either list when default is allow", () => {
    const groups = [
      agentsGroup([serverPolicy("github", { default: "allow" })]),
    ];
    assert.equal(
      evaluatePolicy(principal, groups, "github", "create_issue").decision,
      PolicyDecision.Allowed,
    );
  });

  it("does not grant a denied tool even when default is allow", () => {
    const groups = [
      agentsGroup([
        serverPolicy("github", {
          default: "allow",
          deny: ["delete_repo"],
        }),
      ]),
    ];
    assert.equal(
      evaluatePolicy(principal, groups, "github", "delete_repo").decision,
      PolicyDecision.Denied,
    );
  });

  it("denies the call when any membership group votes deny", () => {
    const dual: AgentPrincipal = { ...principal, groups: ["agents", "ops"] };
    const groups = [
      agentsGroup([
        serverPolicy("github", { allow: ["search_issues"] }),
      ]),
      agentsGroup(
        [serverPolicy("github", { deny: ["search_issues"] })],
        "ops",
      ),
    ];
    assert.equal(
      evaluatePolicy(dual, groups, "github", "search_issues").decision,
      PolicyDecision.Denied,
    );
  });

  it("allows when any membership group votes allow and none deny", () => {
    const dual: AgentPrincipal = { ...principal, groups: ["agents", "ops"] };
    const groups = [
      agentsGroup([
        serverPolicy("github", { allow: ["search_issues"] }),
      ]),
      agentsGroup([serverPolicy("linear", { allow: ["list_issues"] })], "ops"),
    ];
    assert.equal(
      evaluatePolicy(dual, groups, "github", "search_issues").decision,
      PolicyDecision.Allowed,
    );
  });
});

describe("isToolGrantedByAnyGroup", () => {
  it("treats default allow as a grant unless the tool is denied", () => {
    const groups = [
      agentsGroup([
        serverPolicy("github", {
          default: "allow",
          deny: ["delete_repo"],
        }),
      ]),
    ];
    assert.equal(
      isToolGrantedByAnyGroup(groups, "github", "create_issue"),
      true,
    );
    assert.equal(
      isToolGrantedByAnyGroup(groups, "github", "delete_repo"),
      false,
    );
  });

  it("grants tools on an allow list under default deny", () => {
    const groups = [
      agentsGroup([
        serverPolicy("github", { allow: ["search_issues"] }),
      ]),
    ];
    assert.equal(
      isToolGrantedByAnyGroup(groups, "github", "search_issues"),
      true,
    );
    assert.equal(
      isToolGrantedByAnyGroup(groups, "github", "merge_pull_request"),
      false,
    );
  });
});

describe("isGatedToolForGroups", () => {
  it("gates when any membership group lists the bare tool name", () => {
    const groups = [
      agentsGroup([
        serverPolicy("gmail", {
          allow: ["create_draft"],
          gated: ["create_draft"],
        }),
      ]),
    ];
    assert.equal(
      isGatedToolForGroups(principal, groups, "gmail", "create_draft"),
      true,
    );
    assert.equal(
      isGatedToolForGroups(principal, groups, "gmail", "list_drafts"),
      false,
    );
  });

  it("does not treat namespaced names as gated", () => {
    const groups = [
      agentsGroup([
        serverPolicy("gmail", { gated: ["gmail.create_draft"] }),
      ]),
    ];
    assert.equal(
      isGatedToolForGroups(principal, groups, "gmail", "create_draft"),
      false,
    );
  });

  it("gates when a second membership group lists the tool", () => {
    const dual: AgentPrincipal = { ...principal, groups: ["agents", "ops"] };
    const groups = [
      agentsGroup([serverPolicy("gmail", { allow: ["create_draft"] })]),
      agentsGroup(
        [serverPolicy("gmail", { gated: ["create_draft"] })],
        "ops",
      ),
    ];
    assert.equal(
      isGatedToolForGroups(dual, groups, "gmail", "create_draft"),
      true,
    );
  });
});
