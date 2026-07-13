/** MCP `_meta` key for Torii call metadata on `CallToolResult`. */
export const TORII_CALL_META_KEY = "io.keidai/torii" as const;

export interface ToriiCallMeta {
  traceId: string;
}
