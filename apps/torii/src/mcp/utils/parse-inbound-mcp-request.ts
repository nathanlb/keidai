import type { IncomingHttpHeaders } from "node:http";

import { isMcpTasksMethod } from "@keidai/shared";

const METHODS_REQUIRING_NAME = new Set([
  "tools/call",
  "resources/read",
  "prompts/get",
  "tasks/get",
  "tasks/update",
  "tasks/cancel",
]);

const BASE64_SENTINEL = /^=\?base64\?(.+)\?=$/;

export interface InboundMcpRequestContext {
  id: string | number | null;
  method?: string;
  /** Tool name, prompt name, or resource URI from `Mcp-Name` / body params. */
  name?: string;
}

export type InboundMcpResolution =
  | { ok: true; context: InboundMcpRequestContext }
  | { ok: false; context: InboundMcpRequestContext; message: string };

/**
 * Body-only parse used as the validation fallback against routing headers.
 */
export function parseInboundMcpRequest(body: unknown): InboundMcpRequestContext {
  if (!body || typeof body !== "object") {
    return { id: null };
  }

  const request = body as {
    id?: unknown;
    method?: unknown;
    params?: unknown;
  };

  const id =
    typeof request.id === "string" || typeof request.id === "number"
      ? request.id
      : null;

  const method = typeof request.method === "string" ? request.method : undefined;
  const name = bodyNameForMethod(method, request.params);

  return { id, method, name };
}

/**
 * Resolve routing context from `Mcp-Method` / `Mcp-Name`, then cross-check
 * the JSON-RPC body. Headers are the source of truth for traces and gating;
 * the body is only a validation fallback.
 */
export function resolveInboundMcpRequest(
  headers: IncomingHttpHeaders,
  body: unknown,
): InboundMcpResolution {
  const parsedBody = parseInboundMcpRequest(body);
  const methodHeader = readSingleHeader(headers, "mcp-method");
  if (methodHeader === "duplicate") {
    return {
      ok: false,
      context: parsedBody,
      message: "Header mismatch: Mcp-Method header is malformed",
    };
  }

  const method = methodHeader === undefined ? undefined : methodHeader.trim();
  if (!method) {
    return {
      ok: false,
      context: parsedBody,
      message: "Header mismatch: required Mcp-Method header is missing",
    };
  }

  if (parsedBody.method !== undefined && parsedBody.method !== method) {
    return {
      ok: false,
      context: parsedBody,
      message: `Header mismatch: Mcp-Method header value '${method}' does not match body value '${parsedBody.method}'`,
    };
  }

  const nameHeader = readSingleHeader(headers, "mcp-name");
  if (nameHeader === "duplicate") {
    return {
      ok: false,
      context: parsedBody,
      message: "Header mismatch: Mcp-Name header is malformed",
    };
  }

  let name: string | undefined;
  if (nameHeader !== undefined) {
    const decoded = decodeMcpHeaderValue(nameHeader.trim());
    if (decoded === undefined) {
      return {
        ok: false,
        context: parsedBody,
        message: "Header mismatch: Mcp-Name header is malformed",
      };
    }
    name = decoded;
  }

  if (METHODS_REQUIRING_NAME.has(method) && name === undefined) {
    return {
      ok: false,
      context: parsedBody,
      message: "Header mismatch: required Mcp-Name header is missing",
    };
  }

  if (name !== undefined && parsedBody.name !== undefined && parsedBody.name !== name) {
    return {
      ok: false,
      context: parsedBody,
      message: `Header mismatch: Mcp-Name header value '${name}' does not match body value '${parsedBody.name}'`,
    };
  }

  if (METHODS_REQUIRING_NAME.has(method) && parsedBody.name === undefined) {
    return {
      ok: false,
      context: parsedBody,
      message: `Header mismatch: Mcp-Name header value '${name}' does not match body value`,
    };
  }

  return {
    ok: true,
    context: { id: parsedBody.id, method, name },
  };
}

function bodyNameForMethod(
  method: string | undefined,
  params: unknown,
): string | undefined {
  if (!method || !params || typeof params !== "object") {
    return undefined;
  }

  const named = params as { name?: unknown; uri?: unknown; taskId?: unknown };
  if (method === "resources/read" && typeof named.uri === "string") {
    return named.uri;
  }
  if (
    (method === "tools/call" || method === "prompts/get") &&
    typeof named.name === "string"
  ) {
    return named.name;
  }
  if (isMcpTasksMethod(method) && typeof named.taskId === "string") {
    return named.taskId;
  }
  return undefined;
}

function readSingleHeader(
  headers: IncomingHttpHeaders,
  name: string,
): string | "duplicate" | undefined {
  const value = headers[name];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 1) {
      return value[0];
    }
    if (value.length > 1) {
      return "duplicate";
    }
  }
  return undefined;
}

/** Decode SEP-2243 Base64 sentinel values (`=?base64?…?=`); trim is already applied. */
export function decodeMcpHeaderValue(value: string): string | undefined {
  const match = BASE64_SENTINEL.exec(value);
  if (!match?.[1]) {
    return value;
  }
  try {
    return Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return undefined;
  }
}
