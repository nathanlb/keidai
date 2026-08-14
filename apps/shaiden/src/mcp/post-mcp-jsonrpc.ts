import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/client";
import { MCP_TASKS_EXTENSION_ID } from "@keidai/shared";

export const MCP_PROTOCOL_VERSION = "2026-07-28";

export const SHAIDEN_CLIENT_INFO = { name: "shaiden", version: "0.1.0" } as const;

/** Declared on every Client and stamped on per-request `_meta`. */
export const SHAIDEN_CLIENT_CAPABILITIES = {
  extensions: {
    [MCP_TASKS_EXTENSION_ID]: {},
  },
} as const;

export class McpJsonRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "McpJsonRpcError";
    this.code = code;
    this.data = data;
  }
}

let nextJsonRpcId = 1;

export function nextMcpJsonRpcId(): number {
  const id = nextJsonRpcId;
  nextJsonRpcId += 1;
  return id;
}

function requestMeta(): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
    [CLIENT_INFO_META_KEY]: SHAIDEN_CLIENT_INFO,
    [CLIENT_CAPABILITIES_META_KEY]: SHAIDEN_CLIENT_CAPABILITIES,
  };
}

function parseSseJson(text: string): unknown {
  for (const block of text.split("\n\n")) {
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        return JSON.parse(line.slice(5).trim()) as unknown;
      }
    }
  }
  throw new Error("SSE response did not contain a JSON-RPC data event");
}

async function readJsonRpcBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (text.length === 0) {
    throw new Error(`MCP ${response.status} response was empty`);
  }
  if (contentType.includes("text/event-stream")) {
    return parseSseJson(text);
  }
  return JSON.parse(text) as unknown;
}

/**
 * POST one JSON-RPC request to a 2026-07-28 Streamable HTTP MCP endpoint.
 *
 * The TypeScript SDK's 2026-07-28 codec rejects `resultType: "task"` and
 * refuses to send `tasks/*` (deleted from that era). Torii still speaks both
 * on the wire, so Shaiden must issue those methods outside the SDK.
 */
export async function postMcpJsonRpc(input: {
  mcpUrl: string;
  authorization: string;
  method: string;
  params?: Record<string, unknown>;
  name?: string;
  id?: string | number;
}): Promise<Record<string, unknown>> {
  const params = input.params ?? {};
  const existingMeta =
    params._meta && typeof params._meta === "object" && !Array.isArray(params._meta)
      ? (params._meta as Record<string, unknown>)
      : {};

  const body = {
    jsonrpc: "2.0" as const,
    id: input.id ?? nextMcpJsonRpcId(),
    method: input.method,
    params: {
      ...params,
      _meta: {
        ...existingMeta,
        ...requestMeta(),
      },
    },
  };

  const name =
    input.name ??
    (typeof params.name === "string"
      ? params.name
      : typeof params.taskId === "string"
        ? params.taskId
        : undefined);

  const response = await fetch(input.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: input.authorization,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "mcp-method": input.method,
      ...(name ? { "mcp-name": name } : {}),
    },
    body: JSON.stringify(body),
  });

  let json: unknown;
  try {
    json = await readJsonRpcBody(response);
  } catch (error) {
    throw new Error(
      `MCP ${input.method} returned ${response.status} with an unreadable body: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!json || typeof json !== "object") {
    throw new Error(`MCP ${input.method} returned a non-object JSON-RPC body`);
  }

  const error = (json as { error?: { code?: unknown; message?: unknown; data?: unknown } })
    .error;
  if (error) {
    const message =
      typeof error.message === "string" && error.message.length > 0
        ? error.message
        : `MCP ${input.method} failed`;
    throw new McpJsonRpcError(
      typeof error.code === "number" ? error.code : 0,
      message,
      error.data,
    );
  }

  const result = (json as { result?: unknown }).result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`MCP ${input.method} returned no result object`);
  }

  return result as Record<string, unknown>;
}
