import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openRouterModelIdSchema } from "../index.js";

describe("openRouterModelIdSchema", () => {
  it("accepts concrete slugs and latest-family aliases", () => {
    for (const modelId of [
      "google/gemini-2.5-flash",
      "openai/gpt-4o:nitro",
      "~anthropic/claude-haiku-latest",
    ]) {
      assert.equal(openRouterModelIdSchema.parse(modelId), modelId);
    }
    assert.equal(
      openRouterModelIdSchema.parse("  ~anthropic/claude-haiku-latest  "),
      "~anthropic/claude-haiku-latest",
    );
  });

  it("rejects values that are not OpenRouter model ids", () => {
    for (const modelId of [
      "",
      "haiku",
      "~anthropic",
      "~/claude-haiku",
      "has space/slug",
    ]) {
      assert.equal(
        openRouterModelIdSchema.safeParse(modelId).success,
        false,
        modelId,
      );
    }
  });
});
