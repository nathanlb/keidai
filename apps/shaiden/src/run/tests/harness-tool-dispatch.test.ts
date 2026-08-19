import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyDeniedError } from "../../mcp/types/policy-denied-error.js";
import { TaskCancelledError } from "../../mcp/types/task-cancelled-error.js";
import {
  createTestPersistence,
  createTestRun,
} from "../../testing/persistence.js";
import type { RunStore } from "../../runs/run-store.js";
import { createHarnessToolDispatcher } from "../harness-tool-dispatch.js";
import { createLocalRunReporter } from "../run-reporter.js";
import {
  REPORT_TASK_OUTPUT_TOOL,
  TASK_OUTPUT_MAX_LENGTH,
} from "../task-output.js";
import { toolCall } from "../testing/task-loop-harness.js";

const sampleTask = {
  goal: "Summarize the job board.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

async function createHarnessReporter() {
  const persistence = await createTestPersistence();
  const store = persistence.runStore;
  await createTestRun(persistence, {
    runId: "run-1",
    task: sampleTask,
    goal: sampleTask.goal,
  });
  return {
    store,
    reporter: createLocalRunReporter(store, "run-1"),
    close: persistence.close,
  };
}

async function latestSteps(store: RunStore) {
  return (await store.getRun("run-1"))?.steps ?? [];
}

describe("harness tool dispatch", () => {
  it("records dispatch and returns an error result when a tool is unavailable", async () => {
    const { store, reporter, close } = await createHarnessReporter();
    try {
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

      const steps = await latestSteps(store);
      assert.equal(steps.length, 2);
      assert.equal(steps[0]?.kind, "tool_dispatch");
      assert.equal(steps[0]?.toolName, "notion_search");
      assert.equal(steps[0]?.inputPreview, "{}");
      assert.equal(steps[1]?.kind, "tool_result");
      assert.equal(steps[1]?.status, "error");
      assert.equal(steps[1]?.outputPreview, "tool is not available from Torii");
      assert.notEqual(steps[0]?.id, steps[1]?.id);
    } finally {
      await close();
    }
  });

  it("records dispatch and returns an error result when callTool throws", async () => {
    const { store, reporter, close } = await createHarnessReporter();
    try {
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

      const steps = await latestSteps(store);
      assert.equal(steps.length, 2);
      assert.equal(steps[0]?.kind, "tool_dispatch");
      assert.equal(steps[1]?.kind, "tool_result");
      assert.equal(steps[1]?.status, "error");
      assert.equal(steps[1]?.outputPreview, "connection reset");
    } finally {
      await close();
    }
  });

  it("records dispatch and error result when callTool returns isError", async () => {
    const { store, reporter, close } = await createHarnessReporter();
    try {
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

      const steps = await latestSteps(store);
      assert.equal(steps.length, 2);
      assert.equal(steps[0]?.kind, "tool_dispatch");
      assert.equal(steps[1]?.kind, "tool_result");
      assert.equal(steps[1]?.status, "error");
      assert.equal(steps[1]?.outputPreview, "policy denied");
      assert.equal(steps[1]?.toolCallId, "call-1");
    } finally {
      await close();
    }
  });

  it("records an output step for report_task_output without Torii dispatch", async () => {
    const { store, reporter, close } = await createHarnessReporter();
    try {
      let toriiCalls = 0;
      const dispatch = createHarnessToolDispatcher({
        runId: "run-1",
        reporter,
        availableToolNames: new Set(["notion_search"]),
        callTool: async () => {
          toriiCalls += 1;
          return { isError: false, text: "ok" };
        },
      });

      const result = await dispatch({
        toolCallId: "out-1",
        toolName: REPORT_TASK_OUTPUT_TOOL,
        input: { text: "Weekly summary:\n- shipped NAT-155" },
      });

      assert.equal(result.isError, false);
      assert.equal(result.text, "Output recorded for the operator.");
      assert.equal(toriiCalls, 0);

      const steps = await latestSteps(store);
      assert.equal(steps.length, 1);
      assert.equal(steps[0]?.kind, "output");
      if (steps[0]?.kind === "output") {
        assert.equal(steps[0].text, "Weekly summary:\n- shipped NAT-155");
      }
    } finally {
      await close();
    }
  });

  it("rejects invalid report_task_output input without recording a step", async () => {
    const { store, reporter, close } = await createHarnessReporter();
    try {
      const dispatch = createHarnessToolDispatcher({
        runId: "run-1",
        reporter,
        availableToolNames: new Set(),
        callTool: async () => ({ isError: false, text: "ok" }),
      });

      const result = await dispatch({
        toolCallId: "out-bad",
        toolName: REPORT_TASK_OUTPUT_TOOL,
        input: { text: "" },
      });

      assert.equal(result.isError, true);
      assert.equal(result.text, "invalid report_task_output input");
      assert.equal((await latestSteps(store)).length, 0);
    } finally {
      await close();
    }
  });

  it("clips oversized report_task_output text when recording", async () => {
    const { store, reporter, close } = await createHarnessReporter();
    try {
      const dispatch = createHarnessToolDispatcher({
        runId: "run-1",
        reporter,
        availableToolNames: new Set(),
        callTool: async () => ({ isError: false, text: "ok" }),
      });

      const result = await dispatch({
        toolCallId: "out-max",
        toolName: REPORT_TASK_OUTPUT_TOOL,
        input: { text: "x".repeat(TASK_OUTPUT_MAX_LENGTH) },
      });

      assert.equal(result.isError, false);
      const step = (await latestSteps(store))[0];
      assert.equal(step?.kind, "output");
      if (step?.kind === "output") {
        assert.equal(step.text.length, TASK_OUTPUT_MAX_LENGTH);
      }
    } finally {
      await close();
    }
  });

  it("records policyDenied when callTool throws PolicyDeniedError", async () => {
    const { store, reporter, close } = await createHarnessReporter();
    try {
      const dispatch = createHarnessToolDispatcher({
        runId: "run-1",
        reporter,
        availableToolNames: new Set(["notion_search"]),
        callTool: async () => {
          throw new PolicyDeniedError("policy_denied: notion_search");
        },
      });
      const call = toolCall("notion_search", "call-1");

      const result = await dispatch(call);

      assert.equal(result.isError, true);
      assert.equal(result.policyDenied, true);
      assert.match(result.text, /policy_denied/);
      const resultStep = (await latestSteps(store))[1];
      assert.equal(resultStep?.kind, "tool_result");
      if (resultStep?.kind === "tool_result") {
        assert.equal(resultStep.status, "error");
      }
    } finally {
      await close();
    }
  });

  it("rethrows TaskCancelledError so the run can fail closed", async () => {
    const { reporter, close } = await createHarnessReporter();
    try {
      const dispatch = createHarnessToolDispatcher({
        runId: "run-1",
        reporter,
        availableToolNames: new Set(["gmail.create_draft"]),
        callTool: async () => {
          throw new TaskCancelledError();
        },
      });

      await assert.rejects(
        () => dispatch(toolCall("gmail.create_draft", "call-1")),
        TaskCancelledError,
      );
    } finally {
      await close();
    }
  });
});
