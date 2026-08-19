import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger, Task } from "@keidai/shared";
import { createTestPersistence, createTestRun } from "../../testing/persistence.js";
import { resumeParkedHarnessRuns } from "../resume-parked-runs.js";

const sampleTask: Task = {
  goal: "Draft a note.",
  trigger: { type: "now" },
  assignee: "shaiden-newsletter-01",
};

function silentLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

describe("resumeParkedHarnessRuns", () => {
  it("resumes running runs that have a persisted MCP task id", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
        {
          role: "assistant",
          text: "",
          toolCalls: [
            {
              toolCallId: "call-1",
              toolName: "gmail.create_draft",
              input: {},
            },
          ],
        },
      ]);
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "a".repeat(64),
        pollIntervalMs: 1_000,
      });

      const resumed: string[] = [];
      const count = await resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        resumeHarnessRun: (input) => {
          resumed.push(input.runId);
          assert.equal(input.task.goal, sampleTask.goal);
          assert.equal(input.initialHistory[0]?.role, "user");
          return { done: Promise.resolve() };
        },
        logger: silentLogger(),
      });

      assert.equal(count, 1);
      assert.deepEqual(resumed, ["run-1"]);
    } finally {
      await persistence.close();
    }
  });

  it("skips a parked run that has no conversation history", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
      });

      const count = await resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        resumeHarnessRun: () => {
          throw new Error("should not resume");
        },
        logger: silentLogger(),
      });

      assert.equal(count, 0);
    } finally {
      await persistence.close();
    }
  });

  it("skips a parked run whose lease is still held by another replica", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
      ]);
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
      });
      assert.equal(
        await persistence.runStore.claimRun(
          "run-1",
          "replica-a",
          "2026-07-08T12:00:15.000Z",
          "2026-07-08T12:00:00.000Z",
        ),
        true,
      );

      const count = await resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        now: () => Date.parse("2026-07-08T12:00:00.000Z"),
        resumeHarnessRun: () => {
          throw new Error("should not resume");
        },
        logger: silentLogger(),
      });

      assert.equal(count, 0);
    } finally {
      await persistence.close();
    }
  });
});
