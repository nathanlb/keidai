import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("torii run ownership boundary", () => {
  it("does not keep a runs domain under apps/gateway/src", () => {
    const gatewaySrc = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    assert.equal(existsSync(path.join(gatewaySrc, "runs")), false);
  });
});
