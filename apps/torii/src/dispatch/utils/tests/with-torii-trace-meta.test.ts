import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { TORII_CALL_META_KEY } from "@keidai/shared";
import { withToriiCallMeta } from "../with-torii-trace-meta.js";

describe("withToriiCallMeta", () => {
  it("merges the decision into MCP _meta without changing content", () => {
    const result: CallToolResult = {
      isError: false,
      content: [{ type: "text", text: "ok" }],
      _meta: { existing: true },
    };

    const wrapped = withToriiCallMeta(result, {
      traceId: "trace-abc",
      decision: "allowed",
      durationMs: 12,
    });

    assert.deepEqual(wrapped.content, result.content);
    assert.equal(wrapped._meta?.existing, true);
    assert.deepEqual(wrapped._meta?.[TORII_CALL_META_KEY], {
      traceId: "trace-abc",
      decision: "allowed",
      durationMs: 12,
    });
    assert.equal(wrapped.resultType, "complete");
  });

  it("replaces a backend-supplied decision under the Torii meta key", () => {
    const result: CallToolResult = {
      isError: false,
      content: [{ type: "text", text: "ok" }],
      _meta: {
        [TORII_CALL_META_KEY]: {
          traceId: "spoofed",
          decision: "denied",
        },
      },
    };

    const wrapped = withToriiCallMeta(result, {
      traceId: "trace-abc",
      decision: "allowed",
      durationMs: 4,
    });

    assert.deepEqual(wrapped._meta?.[TORII_CALL_META_KEY], {
      traceId: "trace-abc",
      decision: "allowed",
      durationMs: 4,
    });
  });
});
