import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectToolUseModels } from "../select-tool-use-models.js";

describe("selectToolUseModels", () => {
  it("keeps models that advertise tool calling and sorts by name", () => {
    const models = selectToolUseModels({
      data: [
        {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          supported_parameters: ["temperature"],
        },
        {
          id: "google/gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          supported_parameters: ["tools", "tool_choice"],
        },
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          supported_parameters: ["tools"],
        },
        { id: "broken", name: 1, supported_parameters: ["tools"] },
      ],
    });

    assert.deepEqual(models, [
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ]);
  });

  it("returns an empty list for an unexpected payload", () => {
    assert.deepEqual(selectToolUseModels(null), []);
    assert.deepEqual(selectToolUseModels({ data: {} }), []);
  });
});
