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
  it("resumes running runs that have a persisted MCP task id", () => {
    const persistence = createTestPersistence();
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      persistence.runStore.setConversationHistory("run-1", [
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
      persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "a".repeat(64),
        pollIntervalMs: 1_000,
      });

      const resumed: string[] = [];
      const count = resumeParkedHarnessRuns({
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
      persistence.close();
    }
  });

  it("skips a parked run that has no conversation history", () => {
    const persistence = createTestPersistence();
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
      });

      const count = resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        resumeHarnessRun: () => {
          throw new Error("should not resume");
        },
        logger: silentLogger(),
      });

      assert.equal(count, 0);
    } finally {
      persistence.close();
    }
  });
});
