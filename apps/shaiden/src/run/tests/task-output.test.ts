import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clipTaskOutput,
  isHarnessLocalTool,
  parseTaskOutput,
  REPORT_TASK_OUTPUT_TOOL,
  TASK_OUTPUT_MAX_LENGTH,
  taskOutputSchema,
} from "../task-output.js";

describe("task output", () => {
  it("validates report_task_output schema", () => {
    assert.deepEqual(taskOutputSchema.parse({ text: "Done." }), {
      text: "Done.",
    });
  });

  it("rejects empty or oversized text", () => {
    assert.equal(parseTaskOutput({ text: "" }), undefined);
    assert.equal(
      parseTaskOutput({ text: "x".repeat(TASK_OUTPUT_MAX_LENGTH + 1) }),
      undefined,
    );
  });

  it("clips oversized text while preserving newlines", () => {
    const clipped = clipTaskOutput(`line1\n${"x".repeat(TASK_OUTPUT_MAX_LENGTH)}`);
    assert.equal(clipped.startsWith("line1\n"), true);
    assert.equal(clipped.endsWith("…"), true);
    assert.equal(clipped.length, TASK_OUTPUT_MAX_LENGTH + 1);
  });

  it("identifies harness-local output tool", () => {
    assert.equal(isHarnessLocalTool(REPORT_TASK_OUTPUT_TOOL), true);
    assert.equal(isHarnessLocalTool("notion_search"), false);
  });
});
