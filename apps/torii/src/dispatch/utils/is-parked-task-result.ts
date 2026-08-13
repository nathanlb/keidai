import type { CallToolResult } from "@modelcontextprotocol/client";
import type { McpCreateTaskResult } from "@keidai/shared";

export function isParkedTaskResult(
  value: CallToolResult | McpCreateTaskResult,
): value is McpCreateTaskResult {
  return "resultType" in value && value.resultType === "task";
}
