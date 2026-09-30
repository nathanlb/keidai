import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestPersistence, createTestRun } from "../../testing/persistence.js";
import { completeRunWithOutcomeStep } from "../../run/run-completion.js";
import { sweepSandboxWorkspaces } from "../sweep-sandbox-workspaces.js";
import type { SandboxClient } from "../sandbox-client.js";

const sampleTask = {
  goal: "Draft a note.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
};

function memorySandbox(runIds: string[]): SandboxClient & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async exec() {
      throw new Error("not used");
    },
    async deleteRun(runId) {
      deleted.push(runId);
      const index = runIds.indexOf(runId);
      if (index >= 0) {
        runIds.splice(index, 1);
      }
    },
    async listRuns() {
      return [...runIds];
    },
  };
}

describe("sandbox workspace lifecycle", () => {
  it("deletes the workspace when a run reaches a terminal outcome", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      const sandbox = memorySandbox(["run-1"]);
      await completeRunWithOutcomeStep(
        persistence.runStore,
        "run-1",
        { status: "goal_met" },
        sandbox,
      );
      assert.deepEqual(sandbox.deleted, ["run-1"]);
      assert.equal((await persistence.runStore.getRun("run-1"))?.status, "completed");
    } finally {
      await persistence.close();
    }
  });

  it("sweeps terminal and missing workspaces and keeps a running run", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "running-1", task: sampleTask });
      await createTestRun(persistence, { runId: "done-1", task: sampleTask });
      await persistence.runStore.completeRun("done-1", {
        outcome: { status: "stopped" },
      });
      const sandbox = memorySandbox(["running-1", "done-1", "missing-1"]);
      const deleted = await sweepSandboxWorkspaces({
        sandbox,
        runStore: persistence.runStore,
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      });
      assert.equal(deleted, 2);
      assert.deepEqual(sandbox.deleted.sort(), ["done-1", "missing-1"]);
      assert.deepEqual(await sandbox.listRuns(), ["running-1"]);
    } finally {
      await persistence.close();
    }
  });
});
