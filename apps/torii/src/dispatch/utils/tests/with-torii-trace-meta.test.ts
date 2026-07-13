import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TORII_CALL_META_KEY } from "@keidai/shared";
import { withToriiTraceMeta } from "../with-torii-trace-meta.js";

describe("withToriiTraceMeta", () => {
  it("merges traceId into MCP _meta without changing content", () => {
    const result: CallToolResult = {
      isError: false,
      content: [{ type: "text", text: "ok" }],
      _meta: { existing: true },
    };

    const wrapped = withToriiTraceMeta(result, "trace-abc");

    assert.deepEqual(wrapped.content, result.content);
    assert.equal(wrapped._meta?.existing, true);
    assert.deepEqual(wrapped._meta?.[TORII_CALL_META_KEY], {
      traceId: "trace-abc",
    });
  });
});
