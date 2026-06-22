import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractDisplayedText,
  type AgentGenerateSnapshot,
} from "../adapt-agent-result.js";

function snapshot(overrides: Partial<AgentGenerateSnapshot>): AgentGenerateSnapshot {
  return {
    text: "",
    finishReason: "stop",
    steps: [],
    ...overrides,
  };
}

describe("adapt agent result", () => {
  it("prefers final text when present", () => {
    const result = snapshot({
      text: "final",
      steps: [{ text: "earlier", finishReason: "tool-calls", toolCalls: [], toolResults: [] }],
    });

    assert.equal(extractDisplayedText(result), "final");
  });

  it("falls back to the longest earlier step text when final text is empty", () => {
    const result = snapshot({
      text: "",
      steps: [
        { text: "short", finishReason: "tool-calls", toolCalls: [], toolResults: [] },
        {
          text: "much longer digest body",
          finishReason: "tool-calls",
          toolCalls: [],
          toolResults: [],
        },
        { text: "", finishReason: "tool-calls", toolCalls: [], toolResults: [] },
      ],
    });

    assert.equal(extractDisplayedText(result), "much longer digest body");
  });
});
