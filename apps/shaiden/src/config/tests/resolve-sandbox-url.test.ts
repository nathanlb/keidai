import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSandboxUrl } from "../runtime-config.js";

describe("resolveSandboxUrl", () => {
  it("leaves the tool off when the url is unset", () => {
    assert.equal(resolveSandboxUrl({}), undefined);
  });

  it("rejects a misconfigured url at boot", () => {
    assert.throws(
      () => resolveSandboxUrl({ SHAIDEN_SANDBOX_URL: "not a url" }),
      /Invalid SHAIDEN_SANDBOX_URL/,
    );
    assert.throws(
      () => resolveSandboxUrl({ SHAIDEN_SANDBOX_URL: "ftp://sandbox" }),
      /Invalid SHAIDEN_SANDBOX_URL/,
    );
  });

  it("accepts an http url and strips a trailing slash", () => {
    assert.equal(
      resolveSandboxUrl({
        SHAIDEN_SANDBOX_URL: "http://shaiden-sandbox:8080/",
      }),
      "http://shaiden-sandbox:8080",
    );
  });
});
