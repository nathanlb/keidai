import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOperatorAllowed, resolveOperatorOwnerId } from "../allowlist.js";

const operators = [
  {
    owner_id: "owner-sub",
    google_sub: "sub-1",
  },
  {
    owner_id: "owner-email",
    google_email: "ops@example.com",
  },
] as const;

describe("operator registry allowlist", () => {
  it("allows by google_sub and resolves owner", () => {
    const claims = { googleSub: "sub-1", email: "other@example.com" };
    assert.equal(isOperatorAllowed(operators, claims), true);
    assert.equal(resolveOperatorOwnerId(operators, claims), "owner-sub");
  });

  it("allows by google_email when sub does not match", () => {
    const claims = { googleSub: "other", email: "Ops@Example.com" };
    assert.equal(isOperatorAllowed(operators, claims), true);
    assert.equal(resolveOperatorOwnerId(operators, claims), "owner-email");
  });

  it("rejects unknown identities", () => {
    assert.equal(
      isOperatorAllowed(operators, {
        googleSub: "nope",
        email: "nope@example.com",
      }),
      false,
    );
  });
});
