import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findUnansweredToolCalls } from "../pending-tool-calls.js";
import { toolCall } from "../testing/task-loop-harness.js";

describe("findUnansweredToolCalls", () => {
  it("returns tool calls from the latest assistant turn without a tool result", () => {
    const pending = findUnansweredToolCalls([
      { role: "user", text: "goal" },
      {
        role: "assistant",
        text: "",
        toolCalls: [toolCall("gmail.create_draft"), toolCall("linear.list")],
      },
      {
        role: "tool",
        toolCallId: "gmail.create_draft-1",
        toolName: "gmail.create_draft",
        output: "parked",
      },
    ]);
    assert.deepEqual(pending, [toolCall("linear.list")]);
  });

  it("returns an empty list when every tool call has a result", () => {
    assert.deepEqual(
      findUnansweredToolCalls([
        { role: "user", text: "goal" },
        {
          role: "assistant",
          text: "",
          toolCalls: [toolCall("gmail.create_draft")],
        },
        {
          role: "tool",
          toolCallId: "gmail.create_draft-1",
          toolName: "gmail.create_draft",
          output: "ok",
        },
      ]),
      [],
    );
  });
});
