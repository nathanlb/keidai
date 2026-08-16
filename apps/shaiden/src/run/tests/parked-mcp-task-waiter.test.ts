import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger } from "@keidai/shared";
import { createTestPersistence, createTestRun } from "../../testing/persistence.js";
import { createActiveRunHandle } from "../active-run-registry.js";
import { createParkedMcpTaskWaiter } from "../parked-mcp-task-waiter.js";
import { createLocalRunReporter } from "../run-reporter.js";
import { toolCall } from "../testing/task-loop-harness.js";
import type { ToolDispatchResult } from "../types/task-loop.js";

const sampleTask = {
  goal: "Draft a note.",
  trigger: { type: "now" as const },
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

describe("createParkedMcpTaskWaiter", () => {
  it("persists the MCP task id before polling and clears it afterward", async () => {
    const persistence = createTestPersistence();
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      const reporter = createLocalRunReporter(persistence.runStore, "run-1");
      let release!: (result: ToolDispatchResult) => void;
      const polling = new Promise<ToolDispatchResult>((resolve) => {
        release = resolve;
      });
      const wait = createParkedMcpTaskWaiter({
        runId: "run-1",
        runStore: persistence.runStore,
        pollMcpTask: async () => polling,
        reporter,
        logger: silentLogger(),
        activeHandle: createActiveRunHandle("run-1"),
      });

      const pending = wait("task-1", {
        pollIntervalMs: 1_500,
        call: toolCall("gmail.create_draft"),
      });
      assert.deepEqual(persistence.runStore.getParkedMcpTask("run-1"), {
        runId: "run-1",
        mcpTaskId: "task-1",
        pollIntervalMs: 1_500,
      });

      release({ isError: false, text: "draft created" });
      await pending;
      assert.equal(persistence.runStore.getParkedMcpTask("run-1"), null);
    } finally {
      persistence.close();
    }
  });

  it("records a successful polled result with the original tool call", async () => {
    const persistence = createTestPersistence();
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      const reporter = createLocalRunReporter(persistence.runStore, "run-1");
      const call = toolCall("gmail.create_draft", "call-1");
      const wait = createParkedMcpTaskWaiter({
        runId: "run-1",
        runStore: persistence.runStore,
        pollMcpTask: async () => ({ isError: false, text: "draft created" }),
        reporter,
        logger: silentLogger(),
        activeHandle: createActiveRunHandle("run-1"),
      });

      await wait("task-1", { call });

      const steps = persistence.runStore.getRun("run-1")?.steps ?? [];
      const resultStep = steps.find((step) => step.kind === "tool_result");
      assert.equal(resultStep?.kind, "tool_result");
      if (resultStep?.kind === "tool_result") {
        assert.equal(resultStep.toolName, "gmail.create_draft");
        assert.equal(resultStep.toolCallId, "call-1");
        assert.equal(resultStep.status, "ok");
      }
    } finally {
      persistence.close();
    }
  });

  it("does not record a tool_result when the poll is a human denial", async () => {
    const persistence = createTestPersistence();
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      const reporter = createLocalRunReporter(persistence.runStore, "run-1");
      const wait = createParkedMcpTaskWaiter({
        runId: "run-1",
        runStore: persistence.runStore,
        pollMcpTask: async () => ({
          isError: false,
          text: "Human review denied this tool call.",
          approvalDenied: true,
        }),
        reporter,
        logger: silentLogger(),
        activeHandle: createActiveRunHandle("run-1"),
      });

      const result = await wait("task-1", {
        call: toolCall("gmail.create_draft"),
      });
      assert.equal(result.approvalDenied, true);

      const steps = persistence.runStore.getRun("run-1")?.steps ?? [];
      assert.equal(
        steps.some((step) => step.kind === "tool_result"),
        false,
      );
      assert.equal(
        steps.some((step) => step.kind === "waiting_approval"),
        true,
      );
    } finally {
      persistence.close();
    }
  });

  it("reuses the persisted poll interval when the wait context omits it", async () => {
    const persistence = createTestPersistence();
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "task-1",
        pollIntervalMs: 1_500,
      });
      const seen: Array<number | undefined> = [];
      const wait = createParkedMcpTaskWaiter({
        runId: "run-1",
        runStore: persistence.runStore,
        pollMcpTask: async (_taskId, pollIntervalMs) => {
          seen.push(pollIntervalMs);
          return { isError: false, text: "ok" };
        },
        reporter: createLocalRunReporter(persistence.runStore, "run-1"),
        logger: silentLogger(),
        activeHandle: createActiveRunHandle("run-1"),
      });

      await wait("task-1", { call: toolCall("gmail.create_draft") });
      assert.deepEqual(seen, [1_500]);
    } finally {
      persistence.close();
    }
  });
});
