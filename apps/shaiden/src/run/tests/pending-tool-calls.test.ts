import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationEntry } from "../types/conversation-history.js";
import { closeUnansweredToolCalls, findUnansweredToolCalls, RUN_STOPPED_TOOL_OUTPUT } from "../pending-tool-calls.js";
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

  it("closes unanswered tool calls with a synthetic stopped error", () => {
    const history: ConversationEntry[] = [
      { role: "user" as const, text: "goal" },
      {
        role: "assistant" as const,
        text: "",
        toolCalls: [toolCall("gmail.create_draft"), toolCall("linear.list")],
      },
      {
        role: "tool" as const,
        toolCallId: "gmail.create_draft-1",
        toolName: "gmail.create_draft",
        output: "ok",
      },
    ];

    closeUnansweredToolCalls(history);

    assert.deepEqual(findUnansweredToolCalls(history), []);
    const closed = history.at(-1);
    assert.equal(closed?.role, "tool");
    if (closed?.role === "tool") {
      assert.equal(closed.toolCallId, "linear.list-1");
      assert.equal(closed.isError, true);
      assert.equal(closed.output, RUN_STOPPED_TOOL_OUTPUT);
    }
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
