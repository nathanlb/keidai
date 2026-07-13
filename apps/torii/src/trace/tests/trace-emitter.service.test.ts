import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CallTrace } from "@keidai/shared";
import { PolicyDecision } from "@keidai/shared";
import { TraceEmitterService } from "../trace-emitter.service.js";
import { InMemoryTraceRepository } from "../in-memory-trace-repository.service.js";
import {
  finalizeCallTrace,
  toTracePrincipal,
} from "../utils/build-call-trace.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";

describe("finalizeCallTrace", () => {
  it("strips durationMs from denied traces", () => {
    const trace = finalizeCallTrace(
      {
        server: "github",
        tool: "search_issues",
        principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
        credentialRef: "github:stub-user",
        policyDecision: PolicyDecision.Denied,
        durationMs: 42,
        error: "policy denied",
      },
      { traceId: "trace-1", timestamp: "2026-06-20T12:00:00.000Z" },
    );

    assert.equal(trace.policyDecision, PolicyDecision.Denied);
    assert.equal(trace.durationMs, undefined);
  });

  it("preserves durationMs for allowed traces", () => {
    const trace = finalizeCallTrace(
      {
        server: "deepwiki",
        tool: "read_wiki_structure",
        principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
        credentialRef: "none",
        policyDecision: PolicyDecision.Allowed,
        durationMs: 12,
      },
      { traceId: "trace-2", timestamp: "2026-06-20T12:00:00.000Z" },
    );

    assert.equal(trace.durationMs, 12);
  });
});

describe("TraceEmitterService", () => {
  it("emits allowed, denied, and errored trace shapes to stdout", () => {
    const lines: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const emitter = new TraceEmitterService(new InMemoryTraceRepository());
      const traces: CallTrace[] = [
        finalizeCallTrace(
          {
            server: "deepwiki",
            tool: "read_wiki_structure",
            principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
            credentialRef: "none",
            policyDecision: PolicyDecision.Allowed,
            durationMs: 15,
          },
          { traceId: "allowed-trace", timestamp: "2026-06-20T12:00:00.000Z" },
        ),
        finalizeCallTrace(
          {
            server: "github",
            tool: "delete_repo",
            principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
            credentialRef: "github:stub-user",
            policyDecision: PolicyDecision.Denied,
            error: "policy denied",
          },
          { traceId: "denied-trace", timestamp: "2026-06-20T12:00:01.000Z" },
        ),
        finalizeCallTrace(
          {
            server: "stripe",
            tool: "list_customers",
            principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
            credentialRef: "service_key:stripe",
            policyDecision: PolicyDecision.Allowed,
            durationMs: 40,
            error: "backend unavailable",
          },
          { traceId: "error-trace", timestamp: "2026-06-20T12:00:02.000Z" },
        ),
      ];

      for (const trace of traces) {
        emitter.emit(trace);
      }

      assert.equal(lines.length, 3);

      const allowed = JSON.parse(lines[0]!) as CallTrace & { recordType?: string };
      assert.equal(allowed.recordType, "call_trace");
      assert.equal(allowed.traceId, "allowed-trace");
      assert.deepEqual(allowed.principal, {
        agentId: "stub-agent",
        ownerId: "stub-user",
      });
      assert.equal(allowed.policyDecision, PolicyDecision.Allowed);
      assert.equal(allowed.durationMs, 15);
      assert.equal(allowed.error, undefined);

      const denied = JSON.parse(lines[1]!) as CallTrace;
      assert.equal(denied.policyDecision, PolicyDecision.Denied);
      assert.equal(denied.durationMs, undefined);
      assert.equal(denied.error, "policy denied");

      const errored = JSON.parse(lines[2]!) as CallTrace;
      assert.equal(errored.policyDecision, PolicyDecision.Allowed);
      assert.equal(errored.durationMs, 40);
      assert.equal(errored.error, "backend unavailable");

      for (const line of lines) {
        assert.doesNotMatch(line, /sk_test/);
        assert.doesNotMatch(line, /gho_/);
        assert.doesNotMatch(line, /Bearer/);
      }
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
