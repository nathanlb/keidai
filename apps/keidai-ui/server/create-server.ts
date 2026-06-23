import fastifyHttpProxy from "@fastify/http-proxy";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

function resolveStaticRoot(): string {
  const builtClientRoot = path.resolve(serverDir, "../client");
  if (existsSync(builtClientRoot)) {
    return builtClientRoot;
  }

  return path.resolve(serverDir, "../dist/client");
}

export interface CreateServerOptions {
  mode: "development" | "production";
  viteDevServerUrl?: string;
}

export async function createServer(
  options: CreateServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const viteDevServerUrl = options.viteDevServerUrl ?? "http://127.0.0.1:5173";

  if (options.mode === "development") {
    await app.register(fastifyHttpProxy, {
      upstream: viteDevServerUrl,
      prefix: "/",
      websocket: true,
    });
    return app;
  }

  const staticRoot = resolveStaticRoot();
  await app.register(fastifyStatic, {
    root: staticRoot,
    wildcard: false,
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.method === "GET" && !request.url.includes(".")) {
      return reply.sendFile("index.html");
    }

    return reply.code(404).send({ error: "Not Found" });
  });

  return app;
}
