import type { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Forwards an inbound Fastify `/mcp` request to a Node Streamable HTTP transport.
 *
 * Matches the `@modelcontextprotocol/fastify` wiring pattern: pass Fastify's
 * underlying Node req/res (and the pre-parsed POST body) to
 * `transport.handleRequest`.
 */
export async function handleMcpFastifyRequest(
  transport: NodeStreamableHTTPServerTransport,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await transport.handleRequest(
    request.raw,
    reply.raw,
    request.method === "POST" ? request.body : undefined,
  );
}
