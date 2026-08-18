import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRunLeaseError,
  leaseExpiresAt,
  resolveReplicaId,
  RunLeaseLostError,
  RunNotClaimedError,
  startRunLeaseHeartbeat,
} from "../run-lease.js";
import { createTestPersistence, createTestRun } from "../../testing/persistence.js";

const sampleTask = {
  goal: "Draft a note.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
};

describe("run lease helpers", () => {
  it("prefers SHAIDEN_REPLICA_ID when set", () => {
    assert.equal(
      resolveReplicaId({ SHAIDEN_REPLICA_ID: "shaiden-a" }),
      "shaiden-a",
    );
    assert.match(resolveReplicaId({}), /^[0-9a-f-]{36}$/i);
  });

  it("treats claim and lease-lost errors as lease errors", () => {
    assert.equal(isRunLeaseError(new RunNotClaimedError("run-1")), true);
    assert.equal(isRunLeaseError(new RunLeaseLostError("run-1")), true);
    assert.equal(isRunLeaseError(new Error("boom")), false);
  });

  it("stops heartbeating and reports loss after another replica claims", async () => {
    const persistence = createTestPersistence();
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      const now = "2026-07-08T12:00:00.000Z";
      assert.equal(
        persistence.runStore.claimRun(
          "run-1",
          "replica-a",
          leaseExpiresAt(Date.parse(now), 15_000),
          now,
        ),
        true,
      );

      let clock = Date.parse(now);
      const lost = await new Promise<boolean>((resolve) => {
        const stop = startRunLeaseHeartbeat({
          runStore: persistence.runStore,
          runId: "run-1",
          replicaId: "replica-a",
          leaseMs: 30,
          now: () => clock,
          onLost: () => {
            stop();
            resolve(true);
          },
        });
        persistence.runStore.claimRun(
          "run-1",
          "replica-b",
          "2026-07-08T12:01:00.000Z",
          "2026-07-08T12:00:20.000Z",
        );
        clock = Date.parse("2026-07-08T12:00:20.000Z");
      });
      assert.equal(lost, true);
    } finally {
      persistence.close();
    }
  });
});
