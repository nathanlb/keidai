import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyBackendToolResult,
  unsupportedBackendResultToolResult,
} from "../utils/classify-backend-tool-result.js";

describe("classifyBackendToolResult", () => {
  it("treats omitted resultType as a complete CallToolResult", () => {
    const classified = classifyBackendToolResult({
      content: [{ type: "text", text: "ok" }],
    });
    assert.equal(classified.kind, "complete");
  });

  it("treats resultType complete as a CallToolResult", () => {
    const classified = classifyBackendToolResult({
      resultType: "complete",
      content: [{ type: "text", text: "ok" }],
    });
    assert.equal(classified.kind, "complete");
  });

  it("parses a CreateTaskResult", () => {
    const classified = classifyBackendToolResult({
      resultType: "task",
      taskId: "backend-1",
      status: "working",
      createdAt: "2026-08-16T12:00:00.000Z",
      lastUpdatedAt: "2026-08-16T12:00:00.000Z",
      ttlMs: 60_000,
      pollIntervalMs: 250,
    });
    assert.equal(classified.kind, "task");
    if (classified.kind === "task") {
      assert.equal(classified.value.taskId, "backend-1");
      assert.equal(classified.value.pollIntervalMs, 250);
    }
  });

  it("rejects a malformed CreateTaskResult as unrecognized", () => {
    const classified = classifyBackendToolResult({
      resultType: "task",
      taskId: "",
    });
    assert.deepEqual(classified, {
      kind: "unrecognized",
      resultType: "task",
    });
  });

  it("classifies MRTR input_required without inspecting requestState", () => {
    const classified = classifyBackendToolResult({
      resultType: "input_required",
      requestState: "opaque-do-not-touch",
      inputRequests: { elicit: { method: "elicitation/create", params: {} } },
    });
    assert.equal(classified.kind, "input_required");
  });

  it("fails closed on an unknown resultType", () => {
    const classified = classifyBackendToolResult({
      resultType: "stream",
    });
    assert.deepEqual(classified, {
      kind: "unrecognized",
      resultType: "stream",
    });
  });

  it("fails closed on a non-object payload", () => {
    assert.deepEqual(classifyBackendToolResult(null), {
      kind: "unrecognized",
      resultType: "invalid",
    });
    assert.deepEqual(classifyBackendToolResult("ok"), {
      kind: "unrecognized",
      resultType: "invalid",
    });
  });
});

describe("unsupportedBackendResultToolResult", () => {
  it("returns a complete isError tool result", () => {
    const result = unsupportedBackendResultToolResult("not supported");
    assert.equal(result.isError, true);
    assert.equal(
      result.content?.[0] && "text" in result.content[0]
        ? result.content[0].text
        : undefined,
      "not supported",
    );
  });
});
