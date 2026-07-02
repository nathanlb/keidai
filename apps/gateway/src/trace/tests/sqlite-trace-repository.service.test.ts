import "reflect-metadata";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { PolicyDecision } from "@keidai/shared";
import { openGatewayDatabase } from "../../storage/gateway-sqlite.js";
import { SqliteTraceRepository } from "../sqlite-trace-repository.service.js";
import { finalizeCallTrace } from "../utils/build-call-trace.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";
import { toTracePrincipal } from "../utils/build-call-trace.js";

function createRepository(databasePath: string): SqliteTraceRepository {
  return new SqliteTraceRepository(openGatewayDatabase(databasePath));
}

function sampleTrace(
  traceId: string,
  timestamp: string,
  overrides: Partial<Parameters<typeof finalizeCallTrace>[0]> = {},
) {
  return finalizeCallTrace(
    {
      server: "github",
      tool: "search_issues",
      principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
      credentialRef: "github:stub-user",
      policyDecision: PolicyDecision.Allowed,
      durationMs: 12,
      ...overrides,
    },
    { traceId, timestamp },
  );
}

describe("SqliteTraceRepository", () => {
  it("persists traces and returns them newest-first", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-trace-store-")),
      "tokens.db",
    );
    const repository = createRepository(databasePath);

    repository.append(
      sampleTrace("trace-1", "2026-06-20T12:00:00.000Z"),
    );
    repository.append(
      sampleTrace("trace-2", "2026-06-20T12:00:01.000Z"),
    );

    const listed = repository.list({ limit: 10 });
    assert.equal(listed.traces[0]?.traceId, "trace-2");
    assert.equal(listed.traces[1]?.traceId, "trace-1");
    assert.equal(repository.get("trace-1")?.tool, "search_issues");
  });

  it("persists traces across repository instances", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-trace-store-")),
      "tokens.db",
    );
    const firstRepository = createRepository(databasePath);

    firstRepository.append(
      sampleTrace("trace-persisted", "2026-06-20T12:00:00.000Z"),
    );

    const secondRepository = createRepository(databasePath);
    assert.equal(
      secondRepository.get("trace-persisted")?.traceId,
      "trace-persisted",
    );
  });

  it("trims to the configured retention count", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-trace-store-")),
      "tokens.db",
    );
    const repository = new SqliteTraceRepository(
      openGatewayDatabase(databasePath),
      2,
    );

    repository.append(sampleTrace("trace-1", "2026-06-20T12:00:00.000Z"));
    repository.append(sampleTrace("trace-2", "2026-06-20T12:00:01.000Z"));
    repository.append(sampleTrace("trace-3", "2026-06-20T12:00:02.000Z"));

    const listed = repository.list({ limit: 10 });
    assert.deepEqual(
      listed.traces.map((trace) => trace.traceId),
      ["trace-3", "trace-2"],
    );
  });

  it("filters by outcome, server, and free text", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-trace-store-")),
      "tokens.db",
    );
    const repository = createRepository(databasePath);

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
      repository.list({ limit: 10, text: "delete_repo" }).traces[0]?.traceId,
      "denied",
    );
  });
});
