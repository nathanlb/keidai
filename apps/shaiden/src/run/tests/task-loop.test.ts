import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runTaskLoop } from "../task-loop.js";
import {
  approvalRequiredDispatch,
  deferredApprovalDecision,
  limits,
  okDispatch,
  scriptedModel,
  toolCall,
} from "./task-loop-helpers.js";

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
  });

  it("parks on approval_required, replays on approve, and continues", async () => {
    const dispatched: string[] = [];
    const approval = deferredApprovalDecision();

    const loop = runTaskLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("gmail.create_draft")] },
        { text: "Done.", toolCalls: [] },
      ]),
      dispatchToolCall: async (call, options) => {
        dispatched.push(
          options?.approvalId
            ? `${call.toolName}:replay`
            : call.toolName,
        );
        return approvalRequiredDispatch("approval-1")(call, options);
      },
      waitForApproval: approval.waitForApproval,
    });

    await approval.whenPending;
    assert.deepEqual(dispatched, ["gmail.create_draft"]);

    approval.resolve({ status: "approved" });
    const result = await loop;

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.deepEqual(dispatched, ["gmail.create_draft", "gmail.create_draft:replay"]);
  });

  it("returns a denial tool result on reject and lets the agent continue", async () => {
    const approval = deferredApprovalDecision();

    const loop = runTaskLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("gmail.create_draft")] },
        { text: "Adapted without draft.", toolCalls: [] },
      ]),
      dispatchToolCall: approvalRequiredDispatch(),
      waitForApproval: approval.waitForApproval,
    });

    await approval.whenPending;
    approval.resolve({ status: "rejected", reason: "too risky" });
    const settled = await loop;

    assert.deepEqual(settled.outcome, { status: "goal_met" });
    const toolEntry = settled.history.find((entry) => entry.role === "tool");
    assert.match(toolEntry?.output ?? "", /too risky/);
    assert.match(toolEntry?.output ?? "", /authoritative/);
  });

  it("terminates as human_reject when the agent concludes the goal is unreachable", async () => {
    const result = await runTaskLoop("goal", limits, {
      callModel: scriptedModel([
        {
          text: "HUMAN_REJECT: cannot send newsletter without draft approval.",
          toolCalls: [],
        },
      ]),
      dispatchToolCall: okDispatch,
    });

    assert.deepEqual(result.outcome, { status: "human_reject" });
  });

  it("terminates as failed when approval is cancelled by operator", async () => {
    const approval = deferredApprovalDecision();

    const loop = runTaskLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("gmail.create_draft")] },
        { text: "never reached", toolCalls: [] },
      ]),
      dispatchToolCall: approvalRequiredDispatch(),
      waitForApproval: approval.waitForApproval,
    });

    await approval.whenPending;
    approval.resolve({ status: "cancelled" });
    const result = await loop;

    assert.equal(result.outcome.status, "failed");
    if (result.outcome.status === "failed") {
      assert.match(result.outcome.reason, /cancelled by operator/);
    }
  });

  it("does not count approval wait time against the wall-clock timeout", async () => {
    let clock = 0;
    const approval = deferredApprovalDecision();

    const loop = runTaskLoop(
      "goal",
      { ...limits, timeout_seconds: 10 },
      {
        callModel: scriptedModel([
          { text: "", toolCalls: [toolCall("gmail.create_draft")] },
          { text: "Done.", toolCalls: [] },
        ]),
        dispatchToolCall: approvalRequiredDispatch(),
        waitForApproval: async (approvalId) => {
          clock += 20_000;
          return approval.waitForApproval(approvalId);
        },
        now: () => clock,
      },
    );

    await approval.whenPending;
    approval.resolve({ status: "approved" });
    const result = await loop;

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.equal(clock, 20_000);
  });
});
