import { MCP_TASKS_EXTENSION_ID } from "@keidai/shared";
import { postMcpJsonRpc } from "@keidai/shared/mcp-jsonrpc";

export const TORII_OUTBOUND_CLIENT_INFO = {
  name: "torii-gateway",
  version: "0.0.0",
} as const;

/**
 * Declared on outbound Client connect and stamped on per-request `_meta`.
 * Torii only advertises this because it can poll `tasks/get` / cancel.
 */
export const TORII_OUTBOUND_CLIENT_CAPABILITIES = {
  extensions: {
    [MCP_TASKS_EXTENSION_ID]: {},
  },
} as const;

/**
 * POST one JSON-RPC request to a backend Streamable HTTP MCP endpoint under
 * Torii's outbound identity. Used for the methods the SDK codec refuses to
 * carry — `tasks/*` and any `tools/call` that may answer `resultType: "task"`.
 */
export function postBackendMcpJsonRpc(input: {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  protocolVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<Record<string, unknown>> {
  return postMcpJsonRpc({
    ...input,
    clientInfo: TORII_OUTBOUND_CLIENT_INFO,
    clientCapabilities: TORII_OUTBOUND_CLIENT_CAPABILITIES,
  });
}
