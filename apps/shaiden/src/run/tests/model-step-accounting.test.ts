import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelCallAccounting } from "../model-step.js";

describe("modelCallAccounting", () => {
  it("reads tokens, resolved model, and cost from the raw response", () => {
    assert.deepEqual(
      modelCallAccounting({
        usage: { inputTokens: 12, outputTokens: 4 },
        response: {
          modelId: "deepseek/deepseek-v4-flash",
          body: { usage: { prompt_tokens: 12, cost: 0.0004 } },
        },
      }),
      {
        inputTokens: 12,
        outputTokens: 4,
        cost: 0.0004,
        resolvedModelId: "deepseek/deepseek-v4-flash",
      },
    );
  });

  it("omits cost when usage accounting did not return it", () => {
    assert.deepEqual(
      modelCallAccounting({
        usage: { inputTokens: 3, outputTokens: 1 },
        response: {
          modelId: "openai/gpt-4.1-mini",
          body: { usage: { prompt_tokens: 3 } },
        },
      }),
      {
        inputTokens: 3,
        outputTokens: 1,
        resolvedModelId: "openai/gpt-4.1-mini",
      },
    );
  });
});
