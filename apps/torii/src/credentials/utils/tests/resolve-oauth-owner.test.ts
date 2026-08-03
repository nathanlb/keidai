import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { resolveOAuthOwnerId } from "../resolve-oauth-owner.js";

const baseConfig: ToriiConfig = {
  boot_owner_id: "test-owner",
  oauth_providers: {},
  servers: [],
};

describe("resolveOAuthOwnerId", () => {
  it("returns an explicit owner when provided", () => {
    assert.equal(
      resolveOAuthOwnerId(baseConfig, "explicit-owner"),
      "explicit-owner",
    );
  });

  it("falls back to boot_owner_id when owner is omitted", () => {
    assert.equal(resolveOAuthOwnerId(baseConfig, undefined), "test-owner");
  });
});
