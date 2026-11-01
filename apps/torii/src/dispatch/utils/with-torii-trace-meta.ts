import type { CallToolResult } from "@modelcontextprotocol/server";
import {
  MCP_COMPLETE_RESULT_TYPE,
  TORII_CALL_META_KEY,
  type ToriiCallMeta,
} from "@keidai/shared";

/** Stamp Torii's own meta. A backend-supplied value under the same key is replaced. */
export function withToriiCallMeta(
  result: CallToolResult,
  meta: ToriiCallMeta,
): CallToolResult {
  return {
    ...result,
    resultType: MCP_COMPLETE_RESULT_TYPE,
    _meta: {
      ...result._meta,
      [TORII_CALL_META_KEY]: meta,
    },
  };
}
