import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPROVAL_DENIED_STATUS,
  APPROVAL_REQUIRED_STATUS,
  TORII_CALL_META_KEY,
} from "@keidai/shared";
import {
  enrichToolCallResult,
  formatApprovalDeniedForModel,
  mapCallToolResponse,
  mapTerminalMcpTaskToToolCallResult,
} from "../parse-tool-result.js";
import { TaskCancelledError } from "../types/task-cancelled-error.js";

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

  it("maps a CallToolResult including Torii _meta", () => {
    const result = mapCallToolResponse({
      isError: false,
      content: [{ type: "text", text: "ok" }],
      _meta: { [TORII_CALL_META_KEY]: { traceId: "trace-1" } },
    });
    assert.equal(result.text, "ok");
    assert.equal(result.meta?.traceId, "trace-1");
  });

  it("maps a completed denial task to approvalDenied", () => {
    const result = mapTerminalMcpTaskToToolCallResult({
      resultType: "complete",
      taskId: "task-1",
      status: "completed",
      createdAt: "2026-08-13T12:00:00.000Z",
      lastUpdatedAt: "2026-08-13T12:00:00.000Z",
      ttlMs: 60_000,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: APPROVAL_DENIED_STATUS,
              reason: "too risky",
            }),
          },
        ],
        isError: false,
      },
    });
    assert.equal(result.approvalDenied, true);
    assert.match(result.text, /too risky/);
  });

  it("maps a failed task to an error result", () => {
    const result = mapTerminalMcpTaskToToolCallResult({
      resultType: "complete",
      taskId: "task-1",
      status: "failed",
      createdAt: "2026-08-13T12:00:00.000Z",
      lastUpdatedAt: "2026-08-13T12:00:00.000Z",
      ttlMs: 60_000,
      error: { message: "backend blew up" },
    });
    assert.equal(result.isError, true);
    assert.equal(result.text, "backend blew up");
  });

  it("throws TaskCancelledError for a cancelled task", () => {
    assert.throws(
      () =>
        mapTerminalMcpTaskToToolCallResult({
          resultType: "complete",
          taskId: "task-1",
          status: "cancelled",
          createdAt: "2026-08-13T12:00:00.000Z",
          lastUpdatedAt: "2026-08-13T12:00:00.000Z",
          ttlMs: 60_000,
        }),
      TaskCancelledError,
    );
  });
});
