import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TORII_CALL_META_KEY } from "@keidai/shared";
import { enrichToolCallResult } from "../parse-tool-result.js";
import type { ToolCallResult } from "../types/index.js";

describe("Torii call metadata", () => {
  it("nests ToriiCallMeta on ToolCallResult without mixing into functional fields", () => {
    const result: ToolCallResult = {
      ...enrichToolCallResult(false, "ok"),
      meta: { traceId: "trace-123" },
    };

    assert.equal(result.meta?.traceId, "trace-123");
    assert.equal(result.text, "ok");
    assert.equal("traceId" in result, false);
  });

  it("reads ToriiCallMeta from MCP _meta shape", () => {
    const meta = {
      [TORII_CALL_META_KEY]: { traceId: "trace-from-meta" },
    };
    const toriiMeta = meta[TORII_CALL_META_KEY];
    assert.equal(toriiMeta.traceId, "trace-from-meta");
  });
});
