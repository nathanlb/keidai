import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyDecision } from "@keidai/shared";
import { openGatewayDatabase } from "../../storage/gateway-sqlite.js";
import { SqliteTraceRepository } from "../sqlite-trace-repository.service.js";
import type { TraceRepository } from "../types/trace-repository.js";
import { finalizeCallTrace } from "../utils/build-call-trace.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { toTracePrincipal } from "../utils/build-call-trace.js";
import {
  createTestGatewayPersistence,
  type TestGatewayBackend,
} from "../../testing/gateway-persistence.js";
import { MockTraceRepository } from "../../testing/mocks/mock-trace-repository.js";

const backends: TestGatewayBackend[] = ["sqlite", "memory"];

function sampleTrace(
  traceId: string,
  timestamp: string,
  overrides: Partial<Parameters<typeof finalizeCallTrace>[0]> = {},
) {
  return finalizeCallTrace(
    {
      server: "github",
      tool: "search_issues",
      principal: toTracePrincipal(TEST_AGENT_PRINCIPAL),
      credentialRef: "github:test-owner",
      policyDecision: PolicyDecision.Allowed,
      durationMs: 12,
      ...overrides,
    },
    { traceId, timestamp },
  );
}

function runTraceRepositoryContract(
  label: string,
  createRepository: (retentionCount?: number) => {
    repository: TraceRepository;
    close: () => void;
  },
): void {
  describe(label, () => {
    it("persists traces and returns them newest-first", () => {
      const { repository, close } = createRepository();
      try {
        repository.append(sampleTrace("trace-1", "2026-06-20T12:00:00.000Z"));
        repository.append(sampleTrace("trace-2", "2026-06-20T12:00:01.000Z"));

        const listed = repository.list({ limit: 10 });
        assert.equal(listed.traces[0]?.traceId, "trace-2");
        assert.equal(listed.traces[1]?.traceId, "trace-1");
        assert.equal(repository.get("trace-1")?.tool, "search_issues");
      } finally {
        close();
      }
    });

    it("trims to the configured retention count", () => {
      const { repository, close } = createRepository(2);
      try {
        repository.append(sampleTrace("trace-1", "2026-06-20T12:00:00.000Z"));
        repository.append(sampleTrace("trace-2", "2026-06-20T12:00:01.000Z"));
        repository.append(sampleTrace("trace-3", "2026-06-20T12:00:02.000Z"));

        const listed = repository.list({ limit: 10 });
        assert.deepEqual(
          listed.traces.map((trace) => trace.traceId),
          ["trace-3", "trace-2"],
        );
      } finally {
        close();
      }
    });

    it("persists run and step correlation fields", () => {
      const { repository, close } = createRepository();
      try {
        repository.append(
          sampleTrace("trace-correlated", "2026-06-20T12:00:00.000Z", {
            runId: "run-123",
            stepId: "step-456",
          }),
        );

        const trace = repository.get("trace-correlated");
        assert.equal(trace?.runId, "run-123");
        assert.equal(trace?.stepId, "step-456");
      } finally {
        close();
      }
    });

    it("filters by outcome, server, and free text", () => {
      const { repository, close } = createRepository();
      try {
        repository.append(
          sampleTrace("allowed", "2026-06-20T12:00:00.000Z", {
            server: "github",
            tool: "search_issues",
          }),
        );
        repository.append(
          sampleTrace("denied", "2026-06-20T12:00:01.000Z", {
            server: "github",
            tool: "delete_repo",
            policyDecision: PolicyDecision.Denied,
            durationMs: undefined,
            error: "policy denied",
          }),
        );
        repository.append(
          sampleTrace("linking", "2026-06-20T12:00:02.000Z", {
            server: "notion",
            tool: "search",
            error:
              'OAuth connection required for provider "notion" (backend "notion")',
            durationMs: undefined,
          }),
        );

        assert.equal(
          repository.list({ limit: 10, outcome: "denied" }).traces.length,
          1,
        );
        assert.equal(
          repository.list({ limit: 10, server: "notion" }).traces[0]?.traceId,
          "linking",
        );
        assert.equal(
          repository.list({ limit: 10, text: "delete_repo" }).traces[0]
            ?.traceId,
          "denied",
        );
      } finally {
        close();
      }
    });
  });
}

describe("TraceRepository contract", () => {
  for (const backend of backends) {
    runTraceRepositoryContract(`backend=${backend}`, (retentionCount) => {
      if (backend === "memory") {
        return {
          repository: new MockTraceRepository(retentionCount),
          close: () => {},
        };
      }

      const persistence = createTestGatewayPersistence("sqlite");
      assert.ok(persistence.database);
      const repository =
        retentionCount === undefined
          ? persistence.traceRepository
          : new SqliteTraceRepository(persistence.database, retentionCount);
      return {
        repository,
        close: persistence.close,
      };
    });
  }

  it("sqlite persists traces across repository instances", () => {
    const persistence = createTestGatewayPersistence("sqlite");
    assert.ok(persistence.databasePath);

    persistence.traceRepository.append(
      sampleTrace("trace-persisted", "2026-06-20T12:00:00.000Z"),
    );
    persistence.close();

    const reopened = new SqliteTraceRepository(
      openGatewayDatabase(persistence.databasePath),
    );
    assert.equal(
      reopened.get("trace-persisted")?.traceId,
      "trace-persisted",
    );
  });
});
