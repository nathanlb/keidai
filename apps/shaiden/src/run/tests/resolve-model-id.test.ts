import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveModelId } from "../resolve-model-id.js";

describe("resolveModelId", () => {
  it("prefers the task override, then the agent default, then the platform model", () => {
    assert.equal(
      resolveModelId({
        taskModelId: "openai/gpt-4o",
        agentDefaultModelId: "google/gemini-2.5-flash",
        platformModelId: "platform/default",
      }),
      "openai/gpt-4o",
    );
    assert.equal(
      resolveModelId({
        agentDefaultModelId: "google/gemini-2.5-flash",
        platformModelId: "platform/default",
      }),
      "google/gemini-2.5-flash",
    );
    assert.equal(
      resolveModelId({ platformModelId: "platform/default" }),
      "platform/default",
    );
  });
});
