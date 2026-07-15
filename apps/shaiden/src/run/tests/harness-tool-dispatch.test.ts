import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestPersistence, createTestRun } from "../../testing/persistence.js";
import type { RunStore } from "../../runs/run-store.js";
import { createHarnessToolDispatcher } from "../harness-tool-dispatch.js";
import { createLocalRunReporter } from "../run-reporter.js";
import { toolCall } from "./task-loop-helpers.js";

const sampleTask = {
  goal: "Summarize the job board.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

function createHarnessReporter() {
  const persistence = createTestPersistence("sqlite");
  const store = persistence.runStore;
  createTestRun(persistence, {
    runId: "run-1",
    task: sampleTask,
    goal: sampleTask.goal,
  });
  return {
    store,
    reporter: createLocalRunReporter(store, "run-1"),
  };
}

function latestSteps(store: RunStore) {
  return store.getRun("run-1")?.steps ?? [];
}

describe("harness tool dispatch", () => {
  it("records dispatch and returns an error result when a tool is unavailable", async () => {
    const { store, reporter } = createHarnessReporter();
    const dispatch = createHarnessToolDispatcher({
      runId: "run-1",
      reporter,
      availableToolNames: new Set(["other_tool"]),
      callTool: async () => ({ isError: false, text: "ok" }),
    });
    const call = toolCall("notion_search", "call-1");

    const result = await dispatch(call);

    assert.equal(result.isError, true);
    assert.equal(result.text, "tool is not available from Torii");

    const steps = latestSteps(store);
    assert.equal(steps.length, 2);
    assert.equal(steps[0]?.kind, "tool_dispatch");
    assert.equal(steps[0]?.toolName, "notion_search");
    assert.equal(steps[0]?.inputPreview, "{}");
    assert.equal(steps[1]?.kind, "tool_result");
    assert.equal(steps[1]?.status, "error");
    assert.equal(steps[1]?.outputPreview, "tool is not available from Torii");
    assert.notEqual(steps[0]?.id, steps[1]?.id);
  });

  it("records dispatch and returns an error result when callTool throws", async () => {
    const { store, reporter } = createHarnessReporter();
    const dispatch = createHarnessToolDispatcher({
      runId: "run-1",
      reporter,
      availableToolNames: new Set(["notion_search"]),
      callTool: async () => {
        throw new Error("connection reset");
      },
    });
    const call = toolCall("notion_search", "call-1");

    const result = await dispatch(call);

    assert.equal(result.isError, true);
    assert.equal(result.text, "connection reset");

    const steps = latestSteps(store);
    assert.equal(steps.length, 2);
    assert.equal(steps[0]?.kind, "tool_dispatch");
    assert.equal(steps[1]?.kind, "tool_result");
    assert.equal(steps[1]?.status, "error");
    assert.equal(steps[1]?.outputPreview, "connection reset");
  });

  it("records dispatch and error result when callTool returns isError", async () => {
    const { store, reporter } = createHarnessReporter();
    const dispatch = createHarnessToolDispatcher({
      runId: "run-1",
      reporter,
      availableToolNames: new Set(["notion_search"]),
      callTool: async () => ({
        isError: true,
        text: "policy denied",
      }),
    });
    const call = toolCall("notion_search", "call-1");

    const result = await dispatch(call);

    assert.equal(result.isError, true);
    assert.equal(result.text, "policy denied");

    const steps = latestSteps(store);
    assert.equal(steps.length, 2);
    assert.equal(steps[0]?.kind, "tool_dispatch");
    assert.equal(steps[1]?.kind, "tool_result");
    assert.equal(steps[1]?.status, "error");
    assert.equal(steps[1]?.outputPreview, "policy denied");
    assert.equal(steps[1]?.toolCallId, "call-1");
  });
});
