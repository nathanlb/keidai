import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPROVAL_DENIED_STATUS,
  APPROVAL_REQUIRED_STATUS,
} from "@keidai/shared";
import {
  enrichToolCallResult,
  formatApprovalDeniedForModel,
} from "../parse-tool-result.js";

describe("parse tool result", () => {
  it("detects approval_required payloads", () => {
    const result = enrichToolCallResult(
      false,
      JSON.stringify({
        status: APPROVAL_REQUIRED_STATUS,
        approval_id: "abc",
      }),
    );

    assert.deepEqual(result.approvalRequired, { approvalId: "abc" });
  });

  it("formats approval_denied payloads for the model", () => {
    const result = enrichToolCallResult(
      false,
      JSON.stringify({
        status: APPROVAL_DENIED_STATUS,
        reason: "too risky",
      }),
    );

    assert.equal(result.approvalDenied, true);
    assert.match(result.text, /too risky/);
    assert.match(result.text, /authoritative/);
  });

  it("formats denial text consistently", () => {
    assert.match(
      formatApprovalDeniedForModel({ status: APPROVAL_DENIED_STATUS }),
      /authoritative/,
    );
  });
});
