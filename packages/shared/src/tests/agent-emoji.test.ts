import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentEmojiSchema, isSingleEmoji } from "../index.js";

describe("agent emoji", () => {
  it("accepts single emoji including multi-codepoint sequences", () => {
    for (const emoji of ["🦊", "👩‍💻", "👍🏽", "🇨🇦", "1️⃣", "❤️"]) {
      assert.equal(isSingleEmoji(emoji), true, emoji);
    }
  });

  it("rejects text, multiple emoji, and empty strings", () => {
    for (const value of ["", "a", "ab", "🦊🦊", "🦊 x"]) {
      assert.equal(isSingleEmoji(value), false, value);
    }
  });

  it("trims surrounding whitespace before validating", () => {
    assert.equal(agentEmojiSchema.parse(" 🤖 "), "🤖");
    assert.equal(agentEmojiSchema.safeParse("bot").success, false);
  });
});
