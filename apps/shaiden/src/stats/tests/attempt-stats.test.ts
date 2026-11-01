import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTaskStats, type AttemptStatsRow } from "../attempt-stats.js";
import { wilsonInterval } from "../wilson.js";

const filters = { window: "all", scope: "all", kind: "all" } as const;

function row(overrides: Partial<AttemptStatsRow> = {}): AttemptStatsRow {
  return {
    runId: "run-1",
    taskId: "task-1",
    taskRevisionHash: "hash",
    agentId: "agent-1",
    modelId: "model-a",
    personaVersion: 1,
    outcome: "goal_met",
    outcomeReason: null,
    failureClass: null,
    maxIterations: 5,
    timeoutSeconds: 60,
    iterationsUsed: 2,
    activeMs: 1_000,
    approvalRequestCount: 0,
    rejectionCount: 0,
    inputTokens: null,
    outputTokens: null,
    cost: null,
    verdict: null,
    toolCounts: {},
    startedAt: "2026-07-08T12:00:00.000Z",
    retained: true,
    ...overrides,
  };
}

describe("wilsonInterval", () => {
  it("brackets a known 81/100 sample", () => {
    const interval = wilsonInterval(81, 100);
    assert.ok(interval.low > 0.72 && interval.low < 0.73);
    assert.ok(interval.high > 0.87 && interval.high < 0.88);
    assert.ok(interval.low < 0.81 && interval.high > 0.81);
  });
});

describe("buildTaskStats", () => {
  it("omits a percentage below 10 eligible attempts", () => {
    const stats = buildTaskStats(
      "task-1",
      filters,
      Array.from({ length: 9 }, (_, index) =>
        row({ runId: `run-${index}`, outcome: "goal_met" }),
      ),
    );
    assert.equal(stats.byAgentModel[0]?.proportion.rate, null);
    assert.equal(stats.byAgentModel[0]?.proportion.eligible, 9);
    assert.equal(stats.byAgentModel[0]?.proportion.leading, false);
  });

  it("excludes platform failures from the success rate and returns their count", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, index) =>
        row({ runId: `ok-${index}`, outcome: "goal_met" }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        row({
          runId: `platform-${index}`,
          outcome: "failed",
          failureClass: "platform",
          outcomeReason: "transport",
        }),
      ),
    ];
    const stats = buildTaskStats("task-1", filters, rows);
    assert.equal(stats.platformFailureCount, 4);
    assert.equal(stats.attemptCount, 14);
    assert.equal(stats.byAgentModel[0]?.proportion.eligible, 10);
    assert.equal(stats.byAgentModel[0]?.proportion.successes, 10);
    assert.equal(stats.byAgentModel[0]?.proportion.rate, 1);
  });

  it("computes iteration percentiles only over attempts that have a limit", () => {
    const limited = Array.from({ length: 10 }, (_, index) =>
      row({
        runId: `limited-${index}`,
        maxIterations: 5,
        iterationsUsed: index < 9 ? 5 : 1,
      }),
    );
    const unlimited = Array.from({ length: 3 }, (_, index) =>
      row({
        runId: `unlimited-${index}`,
        maxIterations: null,
        iterationsUsed: 40,
      }),
    );
    const stats = buildTaskStats("task-1", filters, [...limited, ...unlimited]);
    assert.equal(stats.iterations?.limitedAttempts, 10);
    assert.equal(stats.iterations?.cappedShare, 0.9);
    assert.ok((stats.iterations?.p50 ?? 0) <= 5);
    assert.ok((stats.iterations?.p90 ?? 0) <= 5);
  });

  it("flags a leading group only when its interval clears the others", () => {
    const strong = Array.from({ length: 20 }, (_, index) =>
      row({
        runId: `strong-${index}`,
        agentId: "strong",
        outcome: "goal_met",
      }),
    );
    const weak = Array.from({ length: 20 }, (_, index) =>
      row({
        runId: `weak-${index}`,
        agentId: "weak",
        outcome: "failed",
        failureClass: "agent",
      }),
    );
    const separated = buildTaskStats("task-1", filters, [...strong, ...weak]);
    const leader = separated.byAgentModel.find(
      (group) => group.proportion.leading,
    );
    assert.equal(leader?.agentId, "strong");

    const close = buildTaskStats(
      "task-1",
      filters,
      Array.from({ length: 20 }, (_, index) =>
        row({
          runId: `close-${index}`,
          agentId: index % 2 === 0 ? "a" : "b",
          outcome: index % 5 === 0 ? "failed" : "goal_met",
          failureClass: index % 5 === 0 ? "agent" : null,
        }),
      ),
    );
    assert.equal(
      close.byAgentModel.some((group) => group.proportion.leading),
      false,
    );
  });

  it("hides operator-confirmed success until verdict coverage reaches 20%", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      row({
        runId: `run-${index}`,
        verdict: index === 0 ? "up" : null,
      }),
    );
    const sparse = buildTaskStats("task-1", filters, rows);
    assert.equal(sparse.verdict.coverage, 0.1);
    assert.equal(sparse.verdict.operatorConfirmedSuccess, null);

    const covered = buildTaskStats(
      "task-1",
      filters,
      rows.map((item, index) => ({
        ...item,
        verdict: index < 2 ? "down" : "up",
        outcome: "goal_met",
      })),
    );
    assert.equal(covered.verdict.disagreementCount, 2);
    assert.equal(covered.verdict.operatorConfirmedSuccess?.successes, 8);
  });
});
