import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunReport } from "@keidai/shared";
import type { ConversationEntry } from "../../run/types/conversation-history.js";
import { presentRunReport } from "../utils/present-run-report.js";

const run: RunReport = {
  id: "run-old",
  taskId: "task-1",
  task: {
    goal: "Summarize the inbox",
    trigger: { type: "now" },
    assignee: "agent-1",
  },
  startedAt: "2026-07-08T12:00:00.000Z",
  assignee: "agent-1",
  goalPreview: "Summarize the inbox",
  status: "completed",
  outcome: { status: "goal_met" },
  stepCount: 4,
  steps: [],
};

const history: ConversationEntry[] = [
  { role: "user", text: "Summarize the inbox" },
  {
    role: "assistant",
    text: "Looking through recent mail",
    toolCalls: [
      {
        toolCallId: "call-1",
        toolName: "gmail.search",
        input: { query: "newer_than:7d" },
      },
    ],
  },
  {
    role: "tool",
    toolCallId: "call-1",
    toolName: "gmail.search",
    output: "3 messages",
  },
  { role: "user", text: "Focus on the customer thread" },
  {
    role: "assistant",
    text: "Three customer messages need a reply.",
    toolCalls: [],
  },
];

describe("presentRunReport", () => {
  it("rebuilds a log from history when stored steps were dropped", () => {
    const presented = presentRunReport(run, history);
    assert.deepEqual(
      presented.steps.map((step) => step.kind),
      [
        "model",
        "tool_dispatch",
        "tool_result",
        "user_message",
        "model",
        "outcome",
      ],
    );
    const followUp = presented.steps.find(
      (step) => step.kind === "user_message",
    );
    assert.equal(
      followUp && followUp.kind === "user_message" ? followUp.text : undefined,
      "Focus on the customer thread",
    );
    const tool = presented.steps.find((step) => step.kind === "tool_result");
    assert.equal(
      tool && tool.kind === "tool_result" ? tool.outputPreview : undefined,
      "3 messages",
    );
  });

  it("leaves a run with stored steps unchanged", () => {
    const stored = presentRunReport(
      {
        ...run,
        steps: [
          {
            id: "step-1",
            timestamp: "2026-07-08T12:00:01.000Z",
            kind: "model",
            text: "Checked the inbox",
          },
        ],
      },
      history,
    );
    assert.equal(stored.steps.length, 1);
    assert.equal(stored.steps[0]?.kind, "model");
  });

  it("does not invent a log for a run that has not recorded steps yet", () => {
    const fresh = presentRunReport(
      { ...run, stepCount: 0, steps: [] },
      history,
    );
    assert.equal(fresh.steps.length, 0);
  });
});
