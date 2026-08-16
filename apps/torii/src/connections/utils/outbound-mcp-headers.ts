import { mcpRoutingName } from "@keidai/shared/mcp-jsonrpc";

/**
 * Ensure Streamable HTTP POSTs carry `Mcp-Method` / `Mcp-Name` (SEP-2243).
 * The SDK client already sets these on modern `_meta`-enveloped requests;
 * legacy initialize / `tools/list` traffic from Torii's backend connector
 * does not, so the credential fetch wrapper fills them from the JSON-RPC body.
 */
export function ensureOutboundMcpRoutingHeaders(
  headers: Headers,
  body: unknown,
): void {
  if (headers.has("mcp-method")) {
    return;
  }

  const message = readJsonRpcMessage(body);
  if (!message) {
    return;
  }

  if (message.method) {
    headers.set("mcp-method", message.method);
  }
  if (message.name) {
    headers.set("mcp-name", message.name);
  }
}

function readJsonRpcMessage(
  body: unknown,
): { method?: string; name?: string } | undefined {
  const parsed = parseJsonBody(body);
  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }

  const request = parsed as {
    method?: unknown;
    params?: unknown;
  };
  const method = typeof request.method === "string" ? request.method : undefined;
  if (!method) {
    return undefined;
  }

  return { method, name: mcpRoutingName(method, request.params) };
}

function parseJsonBody(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return undefined;
    }
  }
  if (body instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(body)) as unknown;
    } catch {
      return undefined;
    }
  }
  return body;
}
