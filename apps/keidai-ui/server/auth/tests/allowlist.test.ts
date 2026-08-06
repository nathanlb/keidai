import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOperatorAllowed, parseAllowlistCsv } from "../allowlist.js";

describe("operator allowlist", () => {
  it("parses comma-separated allowlist entries", () => {
    assert.deepEqual(parseAllowlistCsv(" a, b ,c "), ["a", "b", "c"]);
    assert.deepEqual(parseAllowlistCsv(""), []);
    assert.deepEqual(parseAllowlistCsv(undefined), []);
  });

  it("matches by google sub or email (case-insensitive)", () => {
    const allowlist = {
      googleSubs: new Set(["sub-1"]),
      emails: new Set(["allow@example.com"]),
    };

    assert.equal(
      isOperatorAllowed(allowlist, {
        googleSub: "sub-1",
        email: "other@example.com",
      }),
      true,
    );
    assert.equal(
      isOperatorAllowed(allowlist, {
        googleSub: "nope",
        email: "Allow@Example.com",
      }),
      true,
    );
    assert.equal(
      isOperatorAllowed(allowlist, {
        googleSub: "nope",
        email: "deny@example.com",
      }),
      false,
    );
  });
});
