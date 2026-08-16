import { MCP_TASKS_EXTENSION_ID } from "@keidai/shared";
import {
  MCP_PROTOCOL_VERSION,
  postMcpJsonRpc as postSharedMcpJsonRpc,
} from "@keidai/shared/mcp-jsonrpc";

export { MCP_PROTOCOL_VERSION, McpJsonRpcError } from "@keidai/shared/mcp-jsonrpc";

export const SHAIDEN_CLIENT_INFO = { name: "shaiden", version: "0.1.0" } as const;

/** Declared on every Client and stamped on per-request `_meta`. */
export const SHAIDEN_CLIENT_CAPABILITIES = {
  extensions: {
    [MCP_TASKS_EXTENSION_ID]: {},
  },
} as const;

/**
 * POST one JSON-RPC request to Torii under Shaiden's identity, pinned to
 * 2026-07-28. Used for the methods the SDK codec refuses to carry — `tasks/*`
 * and any `tools/call` that may answer `resultType: "task"`.
 */
export function postMcpJsonRpc(input: {
  mcpUrl: string;
  authorization: string;
  method: string;
  params?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  return postSharedMcpJsonRpc({
    url: input.mcpUrl,
    method: input.method,
    params: input.params,
    headers: { Authorization: input.authorization },
    clientInfo: SHAIDEN_CLIENT_INFO,
    clientCapabilities: SHAIDEN_CLIENT_CAPABILITIES,
    protocolVersion: MCP_PROTOCOL_VERSION,
  });
}
