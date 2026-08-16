import type { CallToolResult } from "@modelcontextprotocol/client";
import {
  MCP_COMPLETE_RESULT_TYPE,
  MCP_CREATE_TASK_RESULT_TYPE,
  MCP_INPUT_REQUIRED_RESULT_TYPE,
  MCP_TASKS_EXTENSION_ID,
  mcpCreateTaskResultSchema,
  type McpCreateTaskResult,
} from "@keidai/shared";

export type ClassifiedBackendToolResult =
  | { kind: "complete"; value: CallToolResult }
  | { kind: "task"; value: McpCreateTaskResult }
  | { kind: "input_required" }
  | { kind: "unrecognized"; resultType: string };

/**
 * Branch on a backend `tools/call` payload. Legacy servers omit `resultType`
 * and MUST be treated as `complete`.
 */
export function classifyBackendToolResult(
  value: unknown,
): ClassifiedBackendToolResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "unrecognized", resultType: "invalid" };
  }

  const record = value as Record<string, unknown>;
  const resultType = record.resultType;

  if (resultType === MCP_CREATE_TASK_RESULT_TYPE) {
    const parsed = mcpCreateTaskResultSchema.safeParse(record);
    if (!parsed.success) {
      return { kind: "unrecognized", resultType: MCP_CREATE_TASK_RESULT_TYPE };
    }
    return { kind: "task", value: parsed.data };
  }

  if (resultType === MCP_INPUT_REQUIRED_RESULT_TYPE) {
    return { kind: "input_required" };
  }

  if (resultType === undefined || resultType === MCP_COMPLETE_RESULT_TYPE) {
    return { kind: "complete", value: record as CallToolResult };
  }

  return {
    kind: "unrecognized",
    resultType: typeof resultType === "string" ? resultType : "invalid",
  };
}

export const BACKEND_INPUT_REQUIRED_MESSAGE =
  'Backend returned resultType "input_required", which Torii does not relay';

export const BACKEND_TASK_INPUT_REQUIRED_MESSAGE =
  "Backend task requires input, which Torii does not relay";

export function unrecognizedBackendResultTypeMessage(resultType: string): string {
  return `Backend returned unrecognised resultType "${resultType}"`;
}

export function backendTaskWithoutClientCapabilityMessage(): string {
  return `Backend returned a task, but the client did not declare ${MCP_TASKS_EXTENSION_ID}`;
}

export function unsupportedBackendResultToolResult(
  message: string,
): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
