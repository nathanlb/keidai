export interface InboundMcpRequestContext {
  id: string | number | null;
  method?: string;
  toolName?: string;
}

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

  let toolName: string | undefined;
  if (
    method === "tools/call" &&
    request.params &&
    typeof request.params === "object" &&
    "name" in request.params &&
    typeof (request.params as { name?: unknown }).name === "string"
  ) {
    toolName = (request.params as { name: string }).name;
  }

  return { id, method, toolName };
}
