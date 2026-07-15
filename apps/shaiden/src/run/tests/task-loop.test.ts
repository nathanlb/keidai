import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runGoalLoop, limits,
  runTaskLoop,
  approvalRequiredDispatch,
  deferredApprovalDecision,
  okDispatch,
  scriptedModel,
  toolCall,
} from "./task-loop-helpers.js";

describe("task loop", () => {
  it("completes a multi-step tool sequence with exactly one goal_met outcome", async () => {
    const dispatched: string[] = [];
    const result = await runGoalLoop("goal", limits, {
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
    const result = await runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("missing_tool")] },
      ]),
      dispatchToolCall: async () => {
        throw new Error("unexpected harness fault");
      },
    });

    assert.equal(result.outcome.status, "failed");
    if (result.outcome.status === "failed") {
      assert.match(result.outcome.reason, /missing_tool/);
      assert.match(result.outcome.reason, /unexpected harness fault/);
    }
  });

  it("feeds an error tool result into history and recovers to goal_met", async () => {
    const result = await runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("send_email")] },
        { text: "Done after correcting the recipient.", toolCalls: [] },
      ]),
      dispatchToolCall: async () => ({
        isError: true,
        text: "unknown recipient",
      }),
    });

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.equal(result.iterations, 2);
    const toolEntry = result.history.find((entry) => entry.role === "tool");
    assert.equal(toolEntry?.role, "tool");
    if (toolEntry?.role === "tool") {
      assert.equal(toolEntry.isError, true);
      assert.match(toolEntry.output, /unknown recipient/);
    }
  });

  it("exhausts iterations on repeated tool errors without failing", async () => {
    const result = await runGoalLoop("goal", limits, {
      callModel: async () => ({
        text: "",
        toolCalls: [toolCall("broken_tool")],
      }),
      dispatchToolCall: async () => ({
        isError: true,
        text: "still broken",
      }),
    });

    assert.deepEqual(result.outcome, { status: "iteration_exhausted" });
    assert.equal(result.iterations, limits.max_iterations);
    const errorEntries = result.history.filter(
      (entry) => entry.role === "tool" && entry.isError,
    );
    assert.equal(errorEntries.length, limits.max_iterations);
  });

  it("times out on repeated tool errors without failing", async () => {
    let clock = 0;
    const result = await runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("slow_broken")] },
        { text: "never reached", toolCalls: [] },
      ]),
      dispatchToolCall: async () => {
        clock += limits.timeout_seconds * 1000 + 1;
        return { isError: true, text: "still broken" };
      },
      now: () => clock,
    });

    assert.deepEqual(result.outcome, { status: "timeout" });
  });
  it("terminates as failed(reason) when the model call throws", async () => {
    const result = await runGoalLoop("goal", limits, {
      callModel: async () => {
        throw new Error("provider unreachable");
      },
      dispatchToolCall: okDispatch,
    });

    assert.equal(result.outcome.status, "failed");
  });

  it("terminates as iteration_exhausted at the iteration cap", async () => {
    let modelCalls = 0;
    const result = await runGoalLoop("goal", limits, {
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
    const result = await runGoalLoop("goal", limits, {
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

    const loop = runGoalLoop("goal", limits, {
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

    const loop = runGoalLoop("goal", limits, {
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
    const result = await runGoalLoop("goal", limits, {
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

    const loop = runGoalLoop("goal", limits, {
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

    const loop = runGoalLoop(
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

  it("continues from restored history with fresh limits", async () => {
    const checkpoints: number[] = [];
    const result = await runTaskLoop(
      {
        initialHistory: [
          { role: "user", text: "original goal" },
          { role: "assistant", text: "first attempt failed", toolCalls: [] },
          { role: "user", text: "try again" },
        ],
        limits,
      },
      {
        callModel: scriptedModel([{ text: "Done on retry.", toolCalls: [] }]),
        dispatchToolCall: okDispatch,
        onHistoryChanged: (history) => {
          checkpoints.push(history.length);
        },
      },
    );

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.equal(result.iterations, 1);
    assert.ok(checkpoints.length > 0);
  });

  it("drains queued follow-up messages before the next model call", async () => {
    const seenUserMessages: string[] = [];
    const approval = deferredApprovalDecision();
    let releaseQueued = false;
    let modelCalls = 0;

    const loop = runGoalLoop("goal", limits, {
      callModel: async (history) => {
        modelCalls += 1;
        for (const entry of history) {
          if (entry.role === "user" && entry.text !== "goal") {
            seenUserMessages.push(entry.text);
          }
        }
        if (modelCalls === 1) {
          return { text: "", toolCalls: [toolCall("gmail.create_draft")] };
        }
        return { text: "Done.", toolCalls: [] };
      },
      dispatchToolCall: approvalRequiredDispatch(),
      waitForApproval: approval.waitForApproval,
      drainPendingUserMessages: () => {
        if (!releaseQueued) {
          return [];
        }
        releaseQueued = false;
        return [{ role: "user", text: "queued guidance" }];
      },
    });

    await approval.whenPending;
    releaseQueued = true;
    approval.resolve({ status: "approved" });
    await loop;

    assert.deepEqual(seenUserMessages, ["queued guidance"]);
  });

  it("drains queued follow-up messages and records a tool error before failing on cancellation", async () => {
    const approval = deferredApprovalDecision();
    let releaseQueued = false;

    const loop = runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("gmail.create_draft")] },
      ]),
      dispatchToolCall: approvalRequiredDispatch(),
      waitForApproval: approval.waitForApproval,
      drainPendingUserMessages: () => {
        if (!releaseQueued) {
          return [];
        }
        releaseQueued = false;
        return [{ role: "user", text: "queued guidance" }];
      },
    });

    await approval.whenPending;
    releaseQueued = true;
    approval.resolve({ status: "cancelled" });
    const result = await loop;

    assert.equal(result.outcome.status, "failed");
    const userMessages = result.history
      .filter((entry) => entry.role === "user")
      .map((entry) => (entry.role === "user" ? entry.text : ""));
    assert.deepEqual(userMessages, ["goal", "queued guidance"]);
    const toolEntries = result.history.filter((entry) => entry.role === "tool");
    assert.equal(toolEntries.length, 1);
    const toolEntry = toolEntries[0];
    if (toolEntry?.role === "tool") {
      assert.equal(toolEntry.isError, true);
      assert.match(toolEntry.output, /cancelled by operator/);
    }
  });

  it("records a synthetic tool error result when dispatch throws", async () => {
    const result = await runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("missing_tool")] },
      ]),
      dispatchToolCall: async () => {
        throw new Error("unexpected harness fault");
      },
    });

    const toolEntries = result.history.filter((entry) => entry.role === "tool");
    assert.equal(toolEntries.length, 1);
    const toolEntry = toolEntries[0];
    assert.equal(toolEntry?.role, "tool");
    if (toolEntry?.role === "tool") {
      assert.equal(toolEntry.isError, true);
      assert.match(toolEntry.output, /unexpected harness fault/);
    }
  });
});
