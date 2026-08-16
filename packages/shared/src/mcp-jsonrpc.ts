import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/client";

/**
 * Raw Streamable HTTP JSON-RPC caller shared by Torii (outbound, to backends)
 * and Shaiden (inbound, to Torii).
 *
 * The TypeScript SDK's 2026-07-28 codec rejects `resultType: "task"` and
 * refuses to send `tasks/*`, so both apps must issue those methods outside the
 * SDK. Everything else should still go through `Client`.
 *
 * Not re-exported from the package root: this module pulls in the MCP client
 * SDK, which has no business in the keidai-ui browser bundle.
 */

/** Protocol era Keidai speaks on the wire. */
export const MCP_PROTOCOL_VERSION = "2026-07-28";

/** Bounded so an HTML error page cannot flood a trace or task error. */
const MAX_BODY_SNIPPET_LENGTH = 200;

export interface McpImplementation {
  name: string;
  version: string;
}

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

function nextId(): number {
  const id = nextJsonRpcId;
  nextJsonRpcId += 1;
  return id;
}

function requestMeta(input: {
  clientInfo: McpImplementation;
  clientCapabilities: Record<string, unknown>;
  protocolVersion?: string;
}): Record<string, unknown> {
  return {
    ...(input.protocolVersion
      ? { [PROTOCOL_VERSION_META_KEY]: input.protocolVersion }
      : {}),
    [CLIENT_INFO_META_KEY]: input.clientInfo,
    [CLIENT_CAPABILITIES_META_KEY]: input.clientCapabilities,
  };
}

/**
 * SEP-2243 `Mcp-Name` routing value, or `undefined` for the methods that
 * address no single primitive. `name` is only meaningful for the methods listed
 * here — other methods use it for unrelated things.
 */
export function mcpRoutingName(
  method: string,
  params: unknown,
): string | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const addressed = params as { name?: unknown; uri?: unknown; taskId?: unknown };
  if (method === "resources/read" && typeof addressed.uri === "string") {
    return addressed.uri;
  }
  if (
    (method === "tools/call" || method === "prompts/get") &&
    typeof addressed.name === "string"
  ) {
    return addressed.name;
  }
  if (method.startsWith("tasks/") && typeof addressed.taskId === "string") {
    return addressed.taskId;
  }
  return undefined;
}

interface JsonRpcResponseEnvelope {
  id: string | number;
  result?: unknown;
  error?: { code?: unknown; message?: unknown; data?: unknown };
}

/**
 * Yield the payload of every SSE `data:` event, joining the multi-line form.
 * Comments (`:`) and other fields are skipped.
 */
function* sseDataPayloads(text: string): Generator<string> {
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (data.length > 0) {
      yield data;
    }
  }
}

function isResponseFor(
  value: unknown,
  id: number,
): value is JsonRpcResponseEnvelope {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const envelope = value as Partial<JsonRpcResponseEnvelope>;
  if (envelope.id !== id) {
    return false;
  }
  return envelope.result !== undefined || envelope.error !== undefined;
}

/**
 * A single Streamable HTTP response may interleave server-initiated
 * notifications and requests ahead of the response we are waiting on, so match
 * on the JSON-RPC id rather than taking the first frame.
 */
function findResponse(
  payloads: Iterable<string>,
  id: number,
): JsonRpcResponseEnvelope | undefined {
  for (const payload of payloads) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      continue;
    }
    if (isResponseFor(parsed, id)) {
      return parsed;
    }
  }
  return undefined;
}

function bodySnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_BODY_SNIPPET_LENGTH
    ? `${collapsed.slice(0, MAX_BODY_SNIPPET_LENGTH)}…`
    : collapsed;
}

async function readResponseEnvelope(
  response: Response,
  method: string,
  id: number,
): Promise<JsonRpcResponseEnvelope> {
  const text = await response.text();
  if (text.length === 0) {
    throw new Error(`MCP ${method} returned ${response.status} with an empty body`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const envelope = findResponse(
    contentType.includes("text/event-stream") ? sseDataPayloads(text) : [text],
    id,
  );
  if (!envelope) {
    throw new Error(
      `MCP ${method} returned ${response.status} without a JSON-RPC response for id ${id}: ${bodySnippet(text)}`,
    );
  }
  return envelope;
}

/**
 * POST one JSON-RPC request and return its `result` object.
 *
 * Throws `McpJsonRpcError` when the peer answered with a JSON-RPC error, and a
 * plain `Error` when the exchange never produced a matching response.
 */
export async function postMcpJsonRpc(input: {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  clientInfo: McpImplementation;
  clientCapabilities: Record<string, unknown>;
  protocolVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const params = input.params ?? {};
  const existingMeta =
    params._meta &&
    typeof params._meta === "object" &&
    !Array.isArray(params._meta)
      ? (params._meta as Record<string, unknown>)
      : {};
  const name = mcpRoutingName(input.method, params);
  const fetchImpl = input.fetchImpl ?? fetch;
  const id = nextId();

  const response = await fetchImpl(input.url, {
    method: "POST",
    headers: {
      ...input.headers,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(input.protocolVersion
        ? { "mcp-protocol-version": input.protocolVersion }
        : {}),
      "mcp-method": input.method,
      ...(name ? { "mcp-name": name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: input.method,
      params: {
        ...params,
        _meta: {
          ...existingMeta,
          ...requestMeta(input),
        },
      },
    }),
  });

  const envelope = await readResponseEnvelope(response, input.method, id);

  if (envelope.error) {
    const message =
      typeof envelope.error.message === "string" &&
      envelope.error.message.length > 0
        ? envelope.error.message
        : `MCP ${input.method} failed`;
    throw new McpJsonRpcError(
      typeof envelope.error.code === "number" ? envelope.error.code : 0,
      message,
      envelope.error.data,
    );
  }

  if (!response.ok) {
    throw new Error(
      `MCP ${input.method} returned ${response.status} with a result payload`,
    );
  }

  const result = envelope.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`MCP ${input.method} returned no result object`);
  }

  return result as Record<string, unknown>;
}
