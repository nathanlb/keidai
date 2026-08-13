import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientDeclaresTasksExtension,
  mcpCreateTaskResultSchema,
  mcpDetailedTaskSchema,
  MCP_TASKS_EXTENSION_ID,
  toCreateTaskResult,
  toGetTaskResult,
  type McpTask,
  type McpWorkingTask,
} from "../mcp-tasks.js";

const workingTask: McpWorkingTask = {
  taskId: "abc",
  status: "working",
  createdAt: "2026-08-13T12:00:00.000Z",
  lastUpdatedAt: "2026-08-13T12:00:00.000Z",
  ttlMs: 60_000,
  pollIntervalMs: 5000,
};

describe("clientDeclaresTasksExtension", () => {
  it("is true when the extension key is present", () => {
    assert.equal(
      clientDeclaresTasksExtension({
        extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
      }),
      true,
    );
  });

  it("is false when capabilities omit the extension", () => {
    assert.equal(clientDeclaresTasksExtension({}), false);
    assert.equal(clientDeclaresTasksExtension({ extensions: {} }), false);
    assert.equal(clientDeclaresTasksExtension(undefined), false);
    assert.equal(clientDeclaresTasksExtension(null), false);
  });
});

describe("MCP Tasks result mappers", () => {
  it("builds a flat CreateTaskResult with resultType task", () => {
    const result = toCreateTaskResult(workingTask satisfies McpTask);
    assert.equal(result.resultType, "task");
    assert.equal(result.taskId, "abc");
    assert.equal(result.status, "working");
    assert.deepEqual(mcpCreateTaskResultSchema.parse(result), result);
  });

  it("builds a tasks/get result with resultType complete", () => {
    const result = toGetTaskResult(workingTask);
    assert.equal(result.resultType, "complete");
    assert.equal(result.status, "working");
    assert.deepEqual(mcpDetailedTaskSchema.parse(workingTask), workingTask);
  });

  it("treats a tool result with isError true as a completed task payload", () => {
    const completed = mcpDetailedTaskSchema.parse({
      ...workingTask,
      status: "completed",
      result: {
        content: [{ type: "text", text: "denied" }],
        isError: true,
      },
    });
    assert.equal(completed.status, "completed");
  });
});
