import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { resolveSubjectTokenReader } from "../runtime-config.js";

describe("resolveSubjectTokenReader", () => {
  it("reads SHAIDEN_BEARER when set alone", () => {
    const read = resolveSubjectTokenReader({
      SHAIDEN_BEARER: "static-secret",
    });
    assert.equal(read(), "static-secret");
  });

  it("re-reads SHAIDEN_SUBJECT_TOKEN_FILE on each call", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shaiden-token-"));
    const file = path.join(dir, "token");
    writeFileSync(file, "token-v1\n", "utf8");
    const read = resolveSubjectTokenReader({
      SHAIDEN_SUBJECT_TOKEN_FILE: file,
    });
    assert.equal(read(), "token-v1");
    writeFileSync(file, "token-v2\n", "utf8");
    assert.equal(read(), "token-v2");
  });

  it("fails when both bearer and file are set", () => {
    assert.throws(
      () =>
        resolveSubjectTokenReader({
          SHAIDEN_BEARER: "a",
          SHAIDEN_SUBJECT_TOKEN_FILE: "/tmp/token",
        }),
      /exactly one/i,
    );
  });

  it("fails when neither is set", () => {
    assert.throws(() => resolveSubjectTokenReader({}), /Missing subject token/);
  });

  it("fails when the subject token file is empty", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shaiden-token-"));
    const file = path.join(dir, "token");
    writeFileSync(file, "  \n", "utf8");
    const read = resolveSubjectTokenReader({
      SHAIDEN_SUBJECT_TOKEN_FILE: file,
    });
    assert.throws(() => read(), /empty/i);
  });
});
