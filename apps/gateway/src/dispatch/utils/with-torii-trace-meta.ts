import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TORII_CALL_META_KEY } from "@keidai/shared";

export function withToriiTraceMeta(
  result: CallToolResult,
  traceId: string,
): CallToolResult {
  return {
    ...result,
    _meta: {
      ...result._meta,
      [TORII_CALL_META_KEY]: { traceId },
    },
  };
}
