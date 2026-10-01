import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationEntry } from "../types/conversation-history.js";
import type { RunBudget } from "../types/task-loop.js";
import {
  runGoalLoop,
  limits,
  modelStep,
  runTaskLoop,
  approvalRequiredDispatch,
  deferredDispatch,
  deferredParkedResult,
  okDispatch,
  scriptedModel,
  toolCall,
} from "../testing/task-loop-harness.js";
import {
  findUnansweredToolCalls,
  RUN_STOPPED_TOOL_OUTPUT,
} from "../pending-tool-calls.js";

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
      callModel: async () =>
        modelStep({ text: "", toolCalls: [toolCall("broken_tool")] }),
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
        return modelStep({
          text: "",
          toolCalls: [toolCall("busy_tool", `call-${modelCalls}`)],
        });
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

  it("parks on approval_required, resumes with the polled tool result, and continues", async () => {
    const dispatched: string[] = [];
    const approval = deferredParkedResult();

    const loop = runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("gmail.create_draft")] },
        { text: "Done.", toolCalls: [] },
      ]),
      dispatchToolCall: async (call) => {
        dispatched.push(call.toolName);
        return approvalRequiredDispatch("approval-1")(call);
      },
      waitForApproval: approval.waitForApproval,
    });

    await approval.whenPending;
    assert.deepEqual(dispatched, ["gmail.create_draft"]);

    approval.resolve({ isError: false, text: "approved result" });
    const result = await loop;

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.deepEqual(dispatched, ["gmail.create_draft"]);
    const toolEntry = result.history.find((entry) => entry.role === "tool");
    assert.equal(toolEntry?.role, "tool");
    if (toolEntry?.role === "tool") {
      assert.equal(toolEntry.output, "approved result");
    }
  });

  it("terminates as failed when a parked poll is denied by policy", async () => {
    const approval = deferredParkedResult();

    const loop = runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("gmail.create_draft")] },
        { text: "should not run", toolCalls: [] },
      ]),
      dispatchToolCall: approvalRequiredDispatch("approval-1"),
      waitForApproval: approval.waitForApproval,
    });

    await approval.whenPending;
    approval.resolve({
      isError: true,
      text: "policy_denied: gmail.create_draft",
      policyDenied: true,
    });
    const result = await loop;

    assert.equal(result.outcome.status, "failed");
    if (result.outcome.status === "failed") {
      assert.match(
        result.outcome.reason,
        /policy denied after approval resume/,
      );
      assert.match(result.outcome.reason, /policy_denied/);
      assert.doesNotMatch(
        result.outcome.reason,
        /connection reset|unreachable/i,
      );
    }
  });

  it("terminates as human_reject immediately when approval is rejected", async () => {
    const approval = deferredParkedResult();
    let modelCalls = 0;

    const loop = runGoalLoop("goal", limits, {
      callModel: async () => {
        modelCalls += 1;
        return modelStep({
          text: "",
          toolCalls: [toolCall("gmail.create_draft")],
        });
      },
      dispatchToolCall: approvalRequiredDispatch(),
      waitForApproval: approval.waitForApproval,
    });

    await approval.whenPending;
    approval.resolve({
      isError: false,
      text: "Human review denied this tool call. Reason: too risky. This denial is authoritative — do not retry this call or attempt the same action through a different tool.",
      approvalDenied: true,
    });
    const settled = await loop;

    assert.deepEqual(settled.outcome, { status: "human_reject" });
    assert.equal(modelCalls, 1);
    const toolEntry = settled.history.find((entry) => entry.role === "tool");
    assert.match(toolEntry?.output ?? "", /too risky/);
    assert.match(toolEntry?.output ?? "", /authoritative/);
  });

  it("terminates as failed(reason) when the agent reports cannot_complete", async () => {
    const result = await runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        {
          text: "I don't have permission to create the draft.",
          toolCalls: [],
          assessment: {
            status: "cannot_complete",
            message: "I don't have permission to create the draft.",
          },
        },
      ]),
      dispatchToolCall: okDispatch,
    });

    assert.deepEqual(result.outcome, {
      status: "failed",
      reason: "I don't have permission to create the draft.",
    });
  });

  it("terminates as failed when a text-only step has no assessment and no message", async () => {
    const result = await runGoalLoop("goal", limits, {
      callModel: async () => ({ text: "", toolCalls: [] }),
      dispatchToolCall: okDispatch,
    });

    assert.deepEqual(result.outcome, {
      status: "failed",
      reason: "model returned no step assessment",
    });
  });

  it("ignores terminal assessment when Torii tool calls are present", async () => {
    const dispatched: string[] = [];
    const result = await runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        {
          text: "calling tool",
          toolCalls: [toolCall("search_issues")],
          assessment: { status: "goal_met", message: "calling tool" },
        },
        { text: "Done.", toolCalls: [] },
      ]),
      dispatchToolCall: async (call) => {
        dispatched.push(call.toolName);
        return { isError: false, text: "ok" };
      },
    });

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.deepEqual(dispatched, ["search_issues"]);
  });

  it("terminates after harness-only output when assessment is present", async () => {
    const dispatched: string[] = [];
    const result = await runGoalLoop("goal", limits, {
      callModel: async () => ({
        text: "Deliverable ready.",
        toolCalls: [
          {
            toolCallId: "out-1",
            toolName: "report_task_output",
            input: { text: "Here is the summary." },
          },
        ],
        assessment: { status: "goal_met", message: "Deliverable ready." },
      }),
      dispatchToolCall: async (call) => {
        dispatched.push(call.toolName);
        return { isError: false, text: "Output recorded for the operator." };
      },
    });

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.deepEqual(dispatched, ["report_task_output"]);
    assert.equal(result.iterations, 1);
  });

  it("continues when output is emitted without a terminal assessment", async () => {
    const dispatched: string[] = [];
    const result = await runGoalLoop("goal", limits, {
      callModel: async () => {
        if (dispatched.length === 0) {
          return {
            text: "Interim note.",
            toolCalls: [
              {
                toolCallId: "out-1",
                toolName: "report_task_output",
                input: { text: "Finding so far." },
              },
            ],
          };
        }
        return {
          text: "Done.",
          toolCalls: [],
          assessment: { status: "goal_met", message: "Done." },
        };
      },
      dispatchToolCall: async (call) => {
        dispatched.push(call.toolName);
        return { isError: false, text: "Output recorded for the operator." };
      },
    });

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.deepEqual(dispatched, ["report_task_output"]);
    assert.equal(result.iterations, 2);
  });

  it("terminates as failed when approval is cancelled by operator", async () => {
    const approval = deferredParkedResult();

    const loop = runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("gmail.create_draft")] },
        { text: "never reached", toolCalls: [] },
      ]),
      dispatchToolCall: approvalRequiredDispatch(),
      waitForApproval: approval.waitForApproval,
    });

    await approval.whenPending;
    approval.reject(new Error("cancelled by operator"));
    const result = await loop;

    assert.equal(result.outcome.status, "failed");
    if (result.outcome.status === "failed") {
      assert.match(result.outcome.reason, /cancelled by operator/);
    }
  });

  it("does not count approval wait time against the wall-clock timeout", async () => {
    let clock = 0;
    const approval = deferredParkedResult();

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
    approval.resolve({ isError: false, text: "approved result" });
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
    const approval = deferredParkedResult();
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
          return modelStep({
            text: "",
            toolCalls: [toolCall("gmail.create_draft")],
          });
        }
        return modelStep({ text: "Done.", toolCalls: [] });
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
    approval.resolve({ isError: false, text: "approved result" });
    await loop;

    assert.deepEqual(seenUserMessages, ["queued guidance"]);
  });

  it("drains queued follow-up messages and records a tool error before failing on cancellation", async () => {
    const approval = deferredParkedResult();
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
    approval.reject(new Error("cancelled by operator"));
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

  it("resumes a parked tool call from restored history without calling the model first", async () => {
    let modelCalls = 0;
    let dispatched = 0;
    const approval = deferredParkedResult();

    const loop = runTaskLoop(
      {
        initialHistory: [
          { role: "user", text: "goal" },
          {
            role: "assistant",
            text: "",
            toolCalls: [toolCall("gmail.create_draft")],
          },
        ],
        limits,
        resumeParkedApproval: { approvalId: "task-1" },
      },
      {
        callModel: async () => {
          modelCalls += 1;
          return modelStep({ text: "Done.", toolCalls: [] });
        },
        dispatchToolCall: async () => {
          dispatched += 1;
          return { isError: false, text: "should not dispatch" };
        },
        waitForApproval: approval.waitForApproval,
      },
    );

    await approval.whenPending;
    assert.equal(modelCalls, 0);
    assert.equal(dispatched, 0);
    approval.resolve({ isError: false, text: "draft created" });
    const result = await loop;

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.equal(modelCalls, 1);
    assert.equal(dispatched, 0);
    const toolEntry = result.history.find((entry) => entry.role === "tool");
    assert.equal(toolEntry?.role, "tool");
    if (toolEntry?.role === "tool") {
      assert.equal(toolEntry.output, "draft created");
    }
  });

  it("resumes a parked tool call and terminates as human_reject", async () => {
    const approval = deferredParkedResult();
    let modelCalls = 0;

    const loop = runTaskLoop(
      {
        initialHistory: [
          { role: "user", text: "goal" },
          {
            role: "assistant",
            text: "",
            toolCalls: [toolCall("gmail.create_draft")],
          },
        ],
        limits,
        resumeParkedApproval: { approvalId: "task-1" },
      },
      {
        callModel: async () => {
          modelCalls += 1;
          return modelStep({ text: "should not run", toolCalls: [] });
        },
        dispatchToolCall: async () => ({
          isError: false,
          text: "should not dispatch",
        }),
        waitForApproval: approval.waitForApproval,
      },
    );

    await approval.whenPending;
    approval.resolve({
      isError: false,
      text: "Human review denied this tool call.",
      approvalDenied: true,
    });
    const result = await loop;

    assert.deepEqual(result.outcome, { status: "human_reject" });
    assert.equal(modelCalls, 0);
  });

  it("resumes a parked tool call and fails when the task is cancelled", async () => {
    const approval = deferredParkedResult();

    const loop = runTaskLoop(
      {
        initialHistory: [
          { role: "user", text: "goal" },
          {
            role: "assistant",
            text: "",
            toolCalls: [toolCall("gmail.create_draft")],
          },
        ],
        limits,
        resumeParkedApproval: { approvalId: "task-1" },
      },
      {
        callModel: async () =>
          modelStep({ text: "should not run", toolCalls: [] }),
        dispatchToolCall: async () => ({
          isError: false,
          text: "should not dispatch",
        }),
        waitForApproval: approval.waitForApproval,
      },
    );

    await approval.whenPending;
    approval.reject(new Error("cancelled by operator"));
    const result = await loop;

    assert.equal(result.outcome.status, "failed");
    if (result.outcome.status === "failed") {
      assert.match(result.outcome.reason, /cancelled by operator/);
    }
  });

  it("stops between steps with outcome stopped", async () => {
    const stop = new AbortController();
    let modelCalls = 0;
    const result = await runGoalLoop("goal", limits, {
      callModel: async () => {
        modelCalls += 1;
        return modelStep({
          text: "",
          toolCalls: [toolCall("search_issues", `search-${modelCalls}`)],
        });
      },
      dispatchToolCall: async () => ({ isError: false, text: "search ok" }),
      onHistoryChanged: (history) => {
        if (
          history.some(
            (entry) => entry.role === "tool" && entry.output === "search ok",
          )
        ) {
          stop.abort();
        }
      },
      stopSignal: stop.signal,
    });

    assert.deepEqual(result.outcome, { status: "stopped" });
    assert.equal(modelCalls, 1);
    const toolEntry = result.history.find((entry) => entry.role === "tool");
    assert.equal(toolEntry?.role, "tool");
    if (toolEntry?.role === "tool") {
      assert.equal(toolEntry.output, "search ok");
      assert.notEqual(toolEntry.isError, true);
    }
  });

  it("closes unanswered tool calls when stop arrives after a model step", async () => {
    const stop = new AbortController();
    let modelCalls = 0;
    const result = await runGoalLoop("goal", limits, {
      callModel: async () => {
        modelCalls += 1;
        if (modelCalls === 1) {
          stop.abort();
          return modelStep({
            text: "",
            toolCalls: [toolCall("search_issues")],
          });
        }
        return modelStep({ text: "should not run", toolCalls: [] });
      },
      dispatchToolCall: okDispatch,
      stopSignal: stop.signal,
    });

    assert.deepEqual(result.outcome, { status: "stopped" });
    assert.equal(modelCalls, 1);
    assert.deepEqual(findUnansweredToolCalls(result.history), []);
    const toolEntry = result.history.find((entry) => entry.role === "tool");
    assert.equal(toolEntry?.role, "tool");
    if (toolEntry?.role === "tool") {
      assert.equal(toolEntry.isError, true);
      assert.equal(toolEntry.output, RUN_STOPPED_TOOL_OUTPUT);
    }
  });

  it("drops an in-flight tool success and keeps history resume-valid", async () => {
    const stop = new AbortController();
    const pending = deferredDispatch();
    const loop = runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        { text: "", toolCalls: [toolCall("slow_tool")] },
        { text: "should not run", toolCalls: [] },
      ]),
      dispatchToolCall: pending.dispatch,
      stopSignal: stop.signal,
    });

    await pending.whenPending;
    stop.abort();
    pending.resolve({ isError: false, text: "SECRET SUCCESS" });
    const result = await loop;

    assert.deepEqual(result.outcome, { status: "stopped" });
    const toolOutputs = result.history
      .filter((entry) => entry.role === "tool")
      .map((entry) => (entry.role === "tool" ? entry.output : ""));
    assert.equal(toolOutputs.includes("SECRET SUCCESS"), false);
    assert.deepEqual(findUnansweredToolCalls(result.history), []);
    assert.equal(toolOutputs.at(-1), RUN_STOPPED_TOOL_OUTPUT);
  });

  it("does not dispatch remaining tool calls after stop", async () => {
    const stop = new AbortController();
    const dispatched: string[] = [];
    const pending = deferredDispatch();
    const loop = runGoalLoop("goal", limits, {
      callModel: scriptedModel([
        {
          text: "",
          toolCalls: [toolCall("first_tool"), toolCall("second_tool")],
        },
      ]),
      dispatchToolCall: async (call, options) => {
        dispatched.push(call.toolName);
        if (call.toolName === "first_tool") {
          return pending.dispatch(call, options);
        }
        return { isError: false, text: `${call.toolName} result` };
      },
      stopSignal: stop.signal,
    });

    await pending.whenPending;
    stop.abort();
    pending.resolve({ isError: false, text: "first result" });
    const result = await loop;

    assert.deepEqual(result.outcome, { status: "stopped" });
    assert.deepEqual(dispatched, ["first_tool"]);
    assert.deepEqual(findUnansweredToolCalls(result.history), []);
  });

  it("continues a reclaimed run with its remaining iterations", async () => {
    const approval = deferredParkedResult();
    let parkedHistory: ConversationEntry[] | undefined;
    let parkedBudget: RunBudget | undefined;

    const first = runTaskLoop(
      {
        initialHistory: [{ role: "user", text: "goal" }],
        limits: { max_iterations: 3, timeout_seconds: 60 },
      },
      {
        callModel: async () =>
          modelStep({
            text: "",
            toolCalls: [toolCall("gmail.create_draft")],
          }),
        dispatchToolCall: approvalRequiredDispatch("task-1"),
        waitForApproval: approval.waitForApproval,
        onHistoryChanged: (history) => {
          parkedHistory = structuredClone(history) as ConversationEntry[];
        },
        onBudgetChanged: (budget) => {
          parkedBudget = { ...budget };
        },
      },
    );

    await approval.whenPending;
    assert.equal(parkedBudget?.iterationsUsed, 1);
    const historyAtPark = parkedHistory;
    const budgetAtPark = parkedBudget;
    assert.ok(historyAtPark);
    assert.ok(budgetAtPark);
    approval.reject(new Error("replica exited"));
    const crashed = await first;
    assert.equal(crashed.outcome.status, "failed");

    let modelCalls = 0;
    const resumed = await runTaskLoop(
      {
        initialHistory: historyAtPark,
        limits: { max_iterations: 3, timeout_seconds: 60 },
        budget: budgetAtPark,
        resumeParkedApproval: { approvalId: "task-1" },
      },
      {
        callModel: async () => {
          modelCalls += 1;
          return modelStep({
            text: "",
            toolCalls: [toolCall("busy_tool", `call-${modelCalls}`)],
          });
        },
        dispatchToolCall: async () => ({ isError: false, text: "ok" }),
        waitForApproval: async () => ({
          isError: false,
          text: "approved result",
        }),
      },
    );

    assert.deepEqual(resumed.outcome, { status: "iteration_exhausted" });
    assert.equal(modelCalls, 2);
    assert.equal(resumed.iterations, 3);
  });

  it("does not count parked or restart time against the active-time budget", async () => {
    let clock = 0;
    const approval = deferredParkedResult();
    let parkedHistory: ConversationEntry[] | undefined;
    let parkedBudget: RunBudget | undefined;

    const first = runTaskLoop(
      {
        initialHistory: [{ role: "user", text: "goal" }],
        limits: { max_iterations: 5, timeout_seconds: 10 },
      },
      {
        now: () => clock,
        callModel: async () => {
          clock += 3_000;
          return modelStep({
            text: "",
            toolCalls: [toolCall("gmail.create_draft")],
          });
        },
        dispatchToolCall: approvalRequiredDispatch("task-1"),
        waitForApproval: async (approvalId) => {
          clock += 50_000;
          return approval.waitForApproval(approvalId);
        },
        onHistoryChanged: (history) => {
          parkedHistory = structuredClone(history) as ConversationEntry[];
        },
        onBudgetChanged: (budget) => {
          parkedBudget = { ...budget };
        },
      },
    );

    await approval.whenPending;
    assert.equal(parkedBudget?.activeElapsedMs, 3_000);
    const historyAtPark = parkedHistory;
    const budgetAtPark = parkedBudget ? { ...parkedBudget } : undefined;
    assert.ok(historyAtPark);
    assert.ok(budgetAtPark);
    approval.reject(new Error("replica exited"));
    await first;

    clock += 120_000;
    let modelCalls = 0;
    const resumed = await runTaskLoop(
      {
        initialHistory: historyAtPark,
        limits: { max_iterations: 5, timeout_seconds: 10 },
        budget: budgetAtPark,
        resumeParkedApproval: { approvalId: "task-1" },
      },
      {
        now: () => clock,
        callModel: async () => {
          modelCalls += 1;
          clock += 8_000;
          return modelStep({
            text: "",
            toolCalls: [toolCall("busy_tool", `call-${modelCalls}`)],
          });
        },
        dispatchToolCall: async () => ({ isError: false, text: "ok" }),
        waitForApproval: async () => {
          clock += 30_000;
          return { isError: false, text: "approved result" };
        },
      },
    );

    assert.deepEqual(resumed.outcome, { status: "timeout" });
    assert.equal(modelCalls, 1);
  });

  it("continues a stop/resume re-entry from the persisted budget", async () => {
    let modelCalls = 0;
    const result = await runTaskLoop(
      {
        initialHistory: [
          { role: "user", text: "goal" },
          { role: "assistant", text: "partial", toolCalls: [] },
        ],
        limits: { max_iterations: 4, timeout_seconds: 60 },
        budget: { iterationsUsed: 2, activeElapsedMs: 1_000 },
      },
      {
        callModel: async () => {
          modelCalls += 1;
          return modelStep({ text: "Done.", toolCalls: [] });
        },
        dispatchToolCall: okDispatch,
      },
    );

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.equal(modelCalls, 1);
    assert.equal(result.iterations, 3);
  });

  it("grants a full budget when the persisted counters were reset", async () => {
    const limitsForSegment = { max_iterations: 4, timeout_seconds: 10 };
    const script = () =>
      scriptedModel([
        { text: "", toolCalls: [toolCall("slow_tool")] },
        { text: "Done.", toolCalls: [] },
      ]);

    let clock = 0;
    const continued = await runTaskLoop(
      {
        initialHistory: [{ role: "user", text: "goal" }],
        limits: limitsForSegment,
        budget: { iterationsUsed: 1, activeElapsedMs: 8_000 },
      },
      {
        now: () => clock,
        callModel: script(),
        dispatchToolCall: async () => {
          clock += 4_000;
          return { isError: false, text: "ok" };
        },
      },
    );
    assert.deepEqual(continued.outcome, { status: "timeout" });

    clock = 0;
    const reset = await runTaskLoop(
      {
        initialHistory: [
          { role: "user", text: "goal" },
          { role: "user", text: "try again" },
        ],
        limits: limitsForSegment,
        budget: { iterationsUsed: 0, activeElapsedMs: 0 },
      },
      {
        now: () => clock,
        callModel: script(),
        dispatchToolCall: async () => {
          clock += 4_000;
          return { isError: false, text: "ok" };
        },
      },
    );
    assert.deepEqual(reset.outcome, { status: "goal_met" });
  });

  it("returns parked when the approval wait hibernates and does not call the model again", async () => {
    let modelCalls = 0;
    const result = await runGoalLoop("goal", limits, {
      callModel: async () => {
        modelCalls += 1;
        return modelStep({
          text: "",
          toolCalls: [toolCall("gmail.create_draft")],
        });
      },
      dispatchToolCall: approvalRequiredDispatch(),
      waitForApproval: async () => ({
        isError: false,
        text: "",
        hibernated: true,
      }),
    });

    assert.deepEqual(result.outcome, { status: "parked" });
    assert.equal(modelCalls, 1);
    assert.equal(
      result.history.filter((entry) => entry.role === "tool").length,
      0,
    );
  });

  it("resets the budget when a wake drains a queued follow-up", async () => {
    const budgets: RunBudget[] = [];
    let modelCalls = 0;
    let drained = false;
    const result = await runTaskLoop(
      {
        initialHistory: [
          { role: "user", text: "goal" },
          {
            role: "assistant",
            text: "",
            toolCalls: [toolCall("gmail.create_draft")],
          },
        ],
        limits: { max_iterations: 2, timeout_seconds: 60 },
        budget: { iterationsUsed: 2, activeElapsedMs: 9_000 },
        resumeParkedApproval: { approvalId: "task-1" },
      },
      {
        callModel: async () => {
          modelCalls += 1;
          return modelStep({ text: "Done.", toolCalls: [] });
        },
        dispatchToolCall: async () => ({ isError: false, text: "ok" }),
        waitForApproval: async () => ({
          isError: false,
          text: "approved result",
        }),
        drainPendingUserMessages: () => {
          if (drained) {
            return [];
          }
          drained = true;
          return [{ role: "user", text: "new instruction" }];
        },
        onBudgetChanged: (budget) => {
          budgets.push({ ...budget });
        },
      },
    );

    assert.equal(modelCalls, 1);
    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.ok(
      budgets.some(
        (budget) => budget.iterationsUsed === 0 && budget.activeElapsedMs === 0,
      ),
    );
  });

  it("keeps the budget when an in-process drain folds a follow-up", async () => {
    const budgets: RunBudget[] = [];
    let releaseQueued = false;
    const approval = deferredParkedResult();
    const loop = runTaskLoop(
      {
        initialHistory: [{ role: "user", text: "goal" }],
        limits: { max_iterations: 3, timeout_seconds: 60 },
        budget: { iterationsUsed: 1, activeElapsedMs: 4_000 },
      },
      {
        callModel: scriptedModel([
          { text: "", toolCalls: [toolCall("gmail.create_draft")] },
          { text: "Done.", toolCalls: [] },
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
        onBudgetChanged: (budget) => {
          budgets.push({ ...budget });
        },
      },
    );

    await approval.whenPending;
    releaseQueued = true;
    approval.resolve({ isError: false, text: "approved result" });
    const result = await loop;

    assert.deepEqual(result.outcome, { status: "goal_met" });
    assert.ok(budgets.length > 0);
    assert.ok(
      budgets.every(
        (budget) =>
          budget.iterationsUsed >= 1 && budget.activeElapsedMs >= 4_000,
      ),
    );
  });
});
