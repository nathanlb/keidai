import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyDecision } from "@keidai/shared";
import { PgTraceRepository } from "../pg-trace-repository.service.js";
import type { TraceRepository } from "../types/trace-repository.js";
import { finalizeCallTrace } from "../utils/build-call-trace.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { toTracePrincipal } from "../utils/build-call-trace.js";
import {
  createTestGatewayPersistence,
  type TestGatewayBackend,
} from "../../testing/gateway-persistence.js";
import { MockTraceRepository } from "../../testing/mocks/mock-trace-repository.js";

const backends: TestGatewayBackend[] = ["postgres", "memory"];

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

function recentTimestamp(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function runTraceRepositoryContract(
  label: string,
  createRepository: (retentionCount?: number) => Promise<{
    repository: TraceRepository;
    close: () => Promise<void>;
  }>,
): void {
  describe(label, () => {
    it("persists traces and returns them newest-first", async () => {
      const { repository, close } = await createRepository();
      try {
        await repository.append(sampleTrace("trace-1", recentTimestamp(0)));
        await repository.append(sampleTrace("trace-2", recentTimestamp(1000)));

        const listed = await repository.list({ limit: 10 });
        assert.equal(listed.traces[0]?.traceId, "trace-2");
        assert.equal(listed.traces[1]?.traceId, "trace-1");
        assert.equal((await repository.get("trace-1"))?.tool, "search_issues");
      } finally {
        await close();
      }
    });

    it("trims to the configured retention count", async () => {
      if (label === "backend=postgres") {
        return;
      }
      const { repository, close } = await createRepository(2);
      try {
        await repository.append(sampleTrace("trace-1", recentTimestamp(0)));
        await repository.append(sampleTrace("trace-2", recentTimestamp(1000)));
        await repository.append(sampleTrace("trace-3", recentTimestamp(2000)));

        const listed = await repository.list({ limit: 10 });
        assert.deepEqual(
          listed.traces.map((trace) => trace.traceId),
          ["trace-3", "trace-2"],
        );
      } finally {
        await close();
      }
    });

    it("persists run and step correlation fields", async () => {
      const { repository, close } = await createRepository();
      try {
        await repository.append(
          sampleTrace("trace-correlated", recentTimestamp(0), {
            runId: "run-123",
            stepId: "step-456",
          }),
        );

        const trace = await repository.get("trace-correlated");
        assert.equal(trace?.runId, "run-123");
        assert.equal(trace?.stepId, "step-456");
      } finally {
        await close();
      }
    });

    it("persists gateway and backend task ids", async () => {
      const { repository, close } = await createRepository();
      try {
        await repository.append(
          sampleTrace("trace-task", recentTimestamp(0), {
            taskId: "gateway-task",
            backendTaskId: "backend-task",
          }),
        );

        const trace = await repository.get("trace-task");
        assert.equal(trace?.taskId, "gateway-task");
        assert.equal(trace?.backendTaskId, "backend-task");
      } finally {
        await close();
      }
    });

    it("filters by outcome, server, and free text", async () => {
      const { repository, close } = await createRepository();
      try {
        await repository.append(
          sampleTrace("allowed", recentTimestamp(0), {
            server: "github",
            tool: "search_issues",
          }),
        );
        await repository.append(
          sampleTrace("denied", recentTimestamp(1000), {
            server: "github",
            tool: "delete_repo",
            policyDecision: PolicyDecision.Denied,
            durationMs: undefined,
            error: "policy denied",
          }),
        );
        await repository.append(
          sampleTrace("linking", recentTimestamp(2000), {
            server: "notion",
            tool: "search",
            error:
              'OAuth connection required for provider "notion" (backend "notion")',
            durationMs: undefined,
          }),
        );

        assert.equal(
          (await repository.list({ limit: 10, outcome: "denied" })).traces.length,
          1,
        );
        assert.equal(
          (await repository.list({ limit: 10, server: "notion" })).traces[0]
            ?.traceId,
          "linking",
        );
        assert.equal(
          (await repository.list({ limit: 10, text: "delete_repo" })).traces[0]
            ?.traceId,
          "denied",
        );
      } finally {
        await close();
      }
    });
  });
}

describe("TraceRepository contract", () => {
  for (const backend of backends) {
    runTraceRepositoryContract(`backend=${backend}`, async (retentionCount) => {
      if (backend === "memory") {
        return {
          repository: new MockTraceRepository(retentionCount),
          close: async () => {},
        };
      }

      const persistence = await createTestGatewayPersistence("postgres");
      return {
        repository: persistence.traceRepository,
        close: persistence.close,
      };
    });
  }

  it("postgres persists traces across repository instances", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.pool);

    try {
      await persistence.traceRepository.append(
        sampleTrace("trace-persisted", recentTimestamp(0)),
      );

      const reopened = new PgTraceRepository(persistence.pool);
      assert.equal(
        (await reopened.get("trace-persisted"))?.traceId,
        "trace-persisted",
      );
    } finally {
      await persistence.close();
    }
  });
});
