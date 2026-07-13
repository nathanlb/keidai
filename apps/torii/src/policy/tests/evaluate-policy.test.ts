import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentPrincipal, PolicyConfig } from "@keidai/shared";
import { PolicyDecision } from "@keidai/shared";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";
import { evaluatePolicy } from "../utils/evaluate-policy.js";

const principal: AgentPrincipal = STUB_AGENT_PRINCIPAL;

describe("evaluatePolicy", () => {
  it("allows tools in allow-list when default is deny", () => {
    const policy: PolicyConfig = { default: "deny", allow: ["search_issues"] };
    assert.equal(evaluatePolicy(principal, policy, "search_issues"), PolicyDecision.Allowed);
  });

  it("denies tools not in allow-list when default is deny", () => {
    const policy: PolicyConfig = { default: "deny", allow: ["search_issues"] };
    assert.equal(
      evaluatePolicy(principal, policy, "merge_pull_request"),
      PolicyDecision.Denied,
    );
  });

  it("allows tools not in deny-list when default is allow", () => {
    const policy: PolicyConfig = { default: "allow", deny: ["delete_repo"] };
    assert.equal(evaluatePolicy(principal, policy, "search_issues"), PolicyDecision.Allowed);
  });

  it("denies tools in deny-list when default is allow", () => {
    const policy: PolicyConfig = { default: "allow", deny: ["delete_repo"] };
    assert.equal(evaluatePolicy(principal, policy, "delete_repo"), PolicyDecision.Denied);
  });
});
