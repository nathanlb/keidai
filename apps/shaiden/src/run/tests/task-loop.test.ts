import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TaskLimits } from "@keidai/shared";
import {
  type ModelStep,
  type ModelToolCall,
  type ToolDispatchResult,
} from "../types/task-loop.js";
import { runTaskLoop } from "../task-loop.js";  

const limits: TaskLimits = {
  max_iterations: 5,
  timeout_seconds: 60,
};

function toolCall(name: string, id = `${name}-1`): ModelToolCall {
  return { toolCallId: id, toolName: name, input: {} };
}

function scriptedModel(steps: ModelStep[]): () => Promise<ModelStep> {
  let index = 0;
  return async () => {
    const step = steps[index];
    assert.ok(step, "model called more times than scripted");
    index++;
    return step;
  };
}

const okDispatch = async (): Promise<ToolDispatchResult> => ({
  isError: false,
  text: "ok",
});

describe("task loop", () => {
  it("completes a multi-step tool sequence with exactly one goal_met outcome", async () => {
    const dispatched: string[] = [];
    const result = await runTaskLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("search_issues")] },
        { text: "", toolCalls: [toolCall("create_draft")] },
        { text: "Done: draft created.", toolCalls: [] },
      ]),
      dispatchToolCall: async (call) => {
        dispatched.push(call.toolName);
        return { isError: false, text: `${call.toolName} result` };
      },
    });

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.equal(result.iterations, 3);
    assert.deepEqual(dispatched, ["search_issues", "create_draft"]);

    const toolEntries = result.history.filter((entry) => entry.role === "tool");
    assert.equal(toolEntries.length, 2);
    assert.equal(toolEntries[0]?.output, "search_issues result");
  });

  it("terminates as failed(reason) when a tool call dispatch throws", async () => {
    const result = await runTaskLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("missing_tool")] },
      ]),
      dispatchToolCall: async () => {
        throw new Error("tool is not available from Torii");
      },
    });

    assert.equal(result.outcome.status, "failed");
    if (result.outcome.status === "failed") {
      assert.match(result.outcome.reason, /missing_tool/);
      assert.match(result.outcome.reason, /not available/);
    }
  });

  it("terminates as failed(reason) when a tool result is an error", async () => {
    const result = await runTaskLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("send_email")] },
      ]),
      dispatchToolCall: async () => ({
        isError: true,
        text: "policy denied",
      }),
    });

    assert.equal(result.outcome.status, "failed");
    if (result.outcome.status === "failed") {
      assert.match(result.outcome.reason, /send_email/);
      assert.match(result.outcome.reason, /policy denied/);
    }
  });

  it("terminates as failed(reason) when the model call throws", async () => {
    const result = await runTaskLoop("goal", limits, {
      callModel: async () => {
        throw new Error("provider unreachable");
      },
      dispatchToolCall: okDispatch,
    });

    assert.equal(result.outcome.status, "failed");
    if (result.outcome.status === "failed") {
      assert.match(result.outcome.reason, /provider unreachable/);
    }
  });

  it("terminates as iteration_exhausted at the iteration cap", async () => {
    let modelCalls = 0;
    const result = await runTaskLoop("goal", limits, {
      callModel: async () => {
        modelCalls++;
        return { text: "", toolCalls: [toolCall("busy_tool", `call-${modelCalls}`)] };
      },
      dispatchToolCall: okDispatch,
    });

    assert.deepEqual(result.outcome, { status: "iteration_exhausted" });
    assert.equal(modelCalls, limits.max_iterations);
    assert.equal(result.iterations, limits.max_iterations);
  });

  it("terminates as timeout when the wall clock passes the deadline", async () => {
    let clock = 0;
    const result = await runTaskLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("slow_tool")] },
        { text: "never reached", toolCalls: [] },
      ]),
      dispatchToolCall: async () => {
        clock += limits.timeout_seconds * 1000 + 1;
        return { isError: false, text: "ok" };
      },
      now: () => clock,
    });

    assert.deepEqual(result.outcome, { status: "timeout" });
    assert.equal(result.iterations, 1);
  });
});
