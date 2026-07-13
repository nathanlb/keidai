import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyDecision } from "@keidai/shared";
import { finalizeCallTrace, toTracePrincipal } from "../utils/build-call-trace.js";
import { deriveTraceOutcome } from "../utils/derive-trace-outcome.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";

describe("deriveTraceOutcome", () => {
  it("maps policy, linking, error, and success traces", () => {
    const denied = finalizeCallTrace(
      {
        server: "github",
        tool: "delete_repo",
        principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
        policyDecision: PolicyDecision.Denied,
        error: "policy denied",
      },
      { traceId: "denied", timestamp: "2026-06-20T12:00:00.000Z" },
    );
    const linking = finalizeCallTrace(
      {
        server: "notion",
        tool: "search",
        principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
        policyDecision: PolicyDecision.Allowed,
        error:
          'OAuth connection required for provider "notion" (backend "notion")',
      },
      { traceId: "linking", timestamp: "2026-06-20T12:00:01.000Z" },
    );
    const error = finalizeCallTrace(
      {
        server: "stripe",
        tool: "list_customers",
        principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
        policyDecision: PolicyDecision.Allowed,
        durationMs: 10,
        error: "backend unavailable",
      },
      { traceId: "error", timestamp: "2026-06-20T12:00:02.000Z" },
    );
    const success = finalizeCallTrace(
      {
        server: "deepwiki",
        tool: "read_wiki_structure",
        principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
        policyDecision: PolicyDecision.Allowed,
        durationMs: 5,
      },
      { traceId: "success", timestamp: "2026-06-20T12:00:03.000Z" },
    );

    assert.equal(deriveTraceOutcome(denied), "denied");
    assert.equal(deriveTraceOutcome(linking), "linking_required");
    assert.equal(deriveTraceOutcome(error), "error");
    assert.equal(deriveTraceOutcome(success), "success");
  });
});
