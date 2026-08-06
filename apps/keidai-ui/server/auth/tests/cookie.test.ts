import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCookieHeader } from "../cookie.js";

describe("parseCookieHeader", () => {
  it("parses name/value pairs", () => {
    const cookies = parseCookieHeader("a=1; b=two%20words");
    assert.equal(cookies.get("a"), "1");
    assert.equal(cookies.get("b"), "two words");
  });

  it("skips malformed percent-encoding instead of throwing", () => {
    const cookies = parseCookieHeader("good=ok; bad=%ZZ; other=fine");
    assert.equal(cookies.get("good"), "ok");
    assert.equal(cookies.get("bad"), undefined);
    assert.equal(cookies.get("other"), "fine");
  });
});
