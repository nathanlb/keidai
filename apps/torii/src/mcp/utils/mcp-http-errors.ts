import type { FastifyReply } from "fastify";
import { ProtocolErrorCode } from "@modelcontextprotocol/server";

/**
 * Torii Streamable HTTP application error code.
 *
 * MCP partitions `-32000`–`-32019` as implementation-defined and reserves
 * `-32020`–`-32099` for the spec. Stay in the implementation-defined band.
 */
export const MCP_APPLICATION_ERROR_CODE = -32000;

/** JSON-RPC internal error code. */
export const MCP_INTERNAL_ERROR_CODE = ProtocolErrorCode.InternalError;

/**
 * Spec-reserved `HeaderMismatch` (`-32020`). Not on `ProtocolErrorCode` in
 * SDK v2 — the HTTP classifier emits it; Torii uses the same wire code at
 * the gateway edge so missing headers never reach identity or the body parser
 * for routing.
 */
export const MCP_HEADER_MISMATCH_ERROR_CODE = -32020;

export const MCP_INTERNAL_SERVER_ERROR_MESSAGE = "Internal server error";

export interface McpJsonRpcErrorBody {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
  };
  id: string | number | null;
}

export function mcpJsonRpcError(
  id: string | number | null,
  error: { code: number; message: string },
): McpJsonRpcErrorBody {
  return {
    jsonrpc: "2.0",
    error,
    id,
  };
}

export function mcpIdentityDeniedError(
  id: string | number | null,
  message: string,
): McpJsonRpcErrorBody {
  return mcpJsonRpcError(id, {
    code: ProtocolErrorCode.InvalidRequest,
    message: `identity_denied: ${message}`,
  });
}

export function mcpHeaderMismatchError(
  id: string | number | null,
  message: string,
): McpJsonRpcErrorBody {
  return mcpJsonRpcError(id, {
    code: MCP_HEADER_MISMATCH_ERROR_CODE,
    message,
  });
}

export function mcpInternalServerError(
  id: string | number | null,
): McpJsonRpcErrorBody {
  return mcpJsonRpcError(id, {
    code: MCP_INTERNAL_ERROR_CODE,
    message: MCP_INTERNAL_SERVER_ERROR_MESSAGE,
  });
}

export function sendMcpHttpError(
  reply: FastifyReply,
  statusCode: number,
  body: McpJsonRpcErrorBody,
): void {
  reply.code(statusCode).send(body);
}
