import type { FastifyRequest } from "fastify";

export function readMcpSessionId(
  request: FastifyRequest,
): string | undefined {
  const header = request.headers["mcp-session-id"];
  return typeof header === "string" && header.length > 0 ? header : undefined;
}
