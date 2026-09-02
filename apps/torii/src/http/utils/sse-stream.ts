import type { FastifyReply, FastifyRequest } from "fastify";

export const SSE_KEEPALIVE_MS = 15_000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/**
 * Hijack the reply as an SSE stream with comment keepalives so idle proxies
 * (BFF, ingress) do not close the connection.
 */
export function openSseStream(
  request: FastifyRequest,
  reply: FastifyReply,
  keepaliveMs = SSE_KEEPALIVE_MS,
): {
  writeEvent: (type: string, data: unknown) => void;
} {
  reply.hijack();
  reply.raw.writeHead(200, SSE_HEADERS);
  reply.raw.write(": connected\n\n");

  const keepalive = setInterval(() => {
    reply.raw.write(": keepalive\n\n");
  }, keepaliveMs);

  request.raw.on("close", () => {
    clearInterval(keepalive);
  });

  return {
    writeEvent(type, data) {
      reply.raw.write(`event: ${type}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    },
  };
}
