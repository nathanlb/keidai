import type { ServerResponse } from "node:http";

/** Streamable HTTP SSE frame for one JSON-RPC message. */
export function writeMcpSseMessage(
  raw: ServerResponse,
  payload: unknown,
): boolean {
  const ok = raw.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
  raw.flushHeaders();
  return ok;
}
