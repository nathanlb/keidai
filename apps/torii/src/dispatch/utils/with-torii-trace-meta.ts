import type { CallToolResult } from "@modelcontextprotocol/server";
import { MCP_COMPLETE_RESULT_TYPE, TORII_CALL_META_KEY } from "@keidai/shared";

export function withToriiTraceMeta(
  result: CallToolResult,
  traceId: string,
): CallToolResult {
  return {
    ...result,
    resultType: MCP_COMPLETE_RESULT_TYPE,
    _meta: {
      ...result._meta,
      [TORII_CALL_META_KEY]: { traceId },
    },
  };
}
