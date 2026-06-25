import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeOAuthLinkState,
  encodeOAuthLinkState,
} from "../oauth-link-state.js";

describe("oauth-link-state", () => {
  it("round-trips owner, provider, and linkId", () => {
    const state = encodeOAuthLinkState({
      ownerId: "owner-1",
      provider: "github",
      linkId: "link-123",
    });
    assert.deepEqual(decodeOAuthLinkState(state), {
      ownerId: "owner-1",
      provider: "github",
      linkId: "link-123",
    });
  });

  it("supports CLI state without linkId", () => {
    const state = encodeOAuthLinkState({
      ownerId: "owner-1",
      provider: "github",
    });
    assert.deepEqual(decodeOAuthLinkState(state), {
      ownerId: "owner-1",
      provider: "github",
    });
  });
});
