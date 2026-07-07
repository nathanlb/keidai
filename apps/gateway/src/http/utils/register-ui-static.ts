import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/** Serves the built keidai-ui client with SPA fallback for client-side routes. */
export async function registerUiStatic(
  app: FastifyInstance,
  clientRoot: string,
): Promise<void> {
  await app.register(fastifyStatic, {
    root: clientRoot,
    wildcard: false,
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.method === "GET" && !request.url.includes(".")) {
      return reply.sendFile("index.html");
    }

    return reply.code(404).send({ error: "Not Found" });
  });
}
