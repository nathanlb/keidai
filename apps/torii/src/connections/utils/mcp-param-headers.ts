/**
 * SEP-2243 `Mcp-Param-*` headers for outbound `tools/call`.
 *
 * Torii posts backend tool calls outside the SDK (the 2026-07-28 codec
 * rejects `resultType: "task"`), so `Client.callTool()` never gets to
 * mirror `x-mcp-header` annotations. GitHub's hosted MCP requires those
 * headers even when the session negotiated a legacy protocol version.
 */

const X_MCP_HEADER_KEY = "x-mcp-header";
const RFC9110_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const PERMITTED_TYPES = new Set(["string", "integer", "boolean", "number"]);
const BASE64_PREFIX = "=?base64?";
const BASE64_SUFFIX = "?=";

interface XMcpHeaderDeclaration {
  path: readonly string[];
  headerName: string;
}

function jsonType(schema: Record<string, unknown>): string | undefined {
  return typeof schema.type === "string" ? schema.type : undefined;
}

function collectDeclarations(
  node: unknown,
  path: readonly string[],
  seenLower: Set<string>,
): XMcpHeaderDeclaration[] {
  if (node === null || typeof node !== "object") {
    return [];
  }

  const schema = node as Record<string, unknown>;
  const found: XMcpHeaderDeclaration[] = [];

  if (X_MCP_HEADER_KEY in schema && path.length > 0) {
    const raw = schema[X_MCP_HEADER_KEY];
    const type = jsonType(schema);
    if (
      typeof raw === "string" &&
      RFC9110_TOKEN.test(raw) &&
      type !== undefined &&
      PERMITTED_TYPES.has(type)
    ) {
      const lower = raw.toLowerCase();
      if (!seenLower.has(lower)) {
        seenLower.add(lower);
        found.push({ path, headerName: raw });
      }
    }
  }

  const properties = schema.properties;
  if (properties !== null && typeof properties === "object") {
    for (const [key, child] of Object.entries(
      properties as Record<string, unknown>,
    )) {
      found.push(...collectDeclarations(child, [...path, key], seenLower));
    }
  }

  return found;
}

function valueAtPath(root: unknown, path: readonly string[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (node === null || typeof node !== "object") {
      return undefined;
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function primitiveToString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return undefined;
    }
    return String(value);
  }
  return undefined;
}

function needsBase64(value: string): boolean {
  if (value.length === 0) {
    return true;
  }
  if (value.startsWith(BASE64_PREFIX) && value.endsWith(BASE64_SUFFIX)) {
    return true;
  }
  if (value !== value.trim()) {
    return true;
  }
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || (code >= 0x20 && code <= 0x7e)) {
      continue;
    }
    return true;
  }
  return false;
}

export function encodeMcpParamValue(value: string): string {
  if (!needsBase64(value)) {
    return value;
  }
  return `${BASE64_PREFIX}${Buffer.from(value, "utf8").toString("base64")}${BASE64_SUFFIX}`;
}

/**
 * Mirror `x-mcp-header` arguments into `mcp-param-*` headers.
 * Null/absent values are omitted. Invalid annotations are skipped.
 */
export function buildOutboundMcpParamHeaders(
  inputSchema: unknown,
  args: Record<string, unknown> | undefined,
): Record<string, string> {
  const declarations = collectDeclarations(inputSchema, [], new Set());
  const headers: Record<string, string> = {};
  for (const declaration of declarations) {
    const raw = valueAtPath(args, declaration.path);
    if (raw === undefined || raw === null) {
      continue;
    }
    const stringValue = primitiveToString(raw);
    if (stringValue === undefined) {
      continue;
    }
    headers[`mcp-param-${declaration.headerName}`] =
      encodeMcpParamValue(stringValue);
  }
  return headers;
}
