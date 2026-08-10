import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOAuthOwnerId } from "../resolve-oauth-owner.js";

describe("resolveOAuthOwnerId", () => {
  it("returns an explicit owner when provided", () => {
    assert.equal(resolveOAuthOwnerId("explicit-owner"), "explicit-owner");
  });

  it("throws when owner is omitted", () => {
    assert.throws(
      () => resolveOAuthOwnerId(undefined),
      /owner query parameter is required/,
    );
  });
});
