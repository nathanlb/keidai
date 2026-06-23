import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { formatBackendToolError } from "../format-backend-tool-error.js";

describe("formatBackendToolError", () => {
  it("joins text content from error results", () => {
    const result: CallToolResult = {
      isError: true,
      content: [{ type: "text", text: "The caller does not have permission" }],
    };

    assert.equal(
      formatBackendToolError(result),
      "The caller does not have permission",
    );
  });

  it("falls back when error results have no text content", () => {
    const result: CallToolResult = {
      isError: true,
      content: [],
    };

    assert.equal(formatBackendToolError(result), "backend returned error result");
  });
});
