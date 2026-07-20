import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { FastifyReply } from "fastify";

/** MCP Streamable HTTP application error code (SDK server transport). */
export const MCP_APPLICATION_ERROR_CODE = -32000;

/** JSON-RPC internal error code. */
export const MCP_INTERNAL_ERROR_CODE = -32603;

export const MCP_SESSION_NOT_FOUND_MESSAGE = "Session not found.";
export const MCP_INVALID_SESSION_ID_MESSAGE = "Invalid or missing session ID";
export const MCP_NO_SESSION_ID_MESSAGE =
  "Bad Request: No valid session ID provided";
export const MCP_SESSION_PRINCIPAL_MISMATCH_MESSAGE =
  "identity_denied: session principal mismatch";
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
    code: ErrorCode.InvalidRequest,
    message: `identity_denied: ${message}`,
  });
}

export function mcpSessionNotFoundError(
  id: string | number | null,
): McpJsonRpcErrorBody {
  return mcpJsonRpcError(id, {
    code: MCP_APPLICATION_ERROR_CODE,
    message: MCP_SESSION_NOT_FOUND_MESSAGE,
  });
}

export function mcpInvalidSessionIdError(
  id: string | number | null,
): McpJsonRpcErrorBody {
  return mcpJsonRpcError(id, {
    code: MCP_APPLICATION_ERROR_CODE,
    message: MCP_INVALID_SESSION_ID_MESSAGE,
  });
}

export function mcpNoSessionIdError(
  id: string | number | null,
): McpJsonRpcErrorBody {
  return mcpJsonRpcError(id, {
    code: MCP_APPLICATION_ERROR_CODE,
    message: MCP_NO_SESSION_ID_MESSAGE,
  });
}

export function mcpSessionPrincipalMismatchError(
  id: string | number | null,
): McpJsonRpcErrorBody {
  return mcpJsonRpcError(id, {
    code: ErrorCode.InvalidRequest,
    message: MCP_SESSION_PRINCIPAL_MISMATCH_MESSAGE,
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
