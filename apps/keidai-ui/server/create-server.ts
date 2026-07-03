import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

function resolveDefaultClientRoot(): string {
  const builtClientRoot = path.resolve(serverDir, "../client");
  if (existsSync(builtClientRoot)) {
    return builtClientRoot;
  }

  return path.resolve(serverDir, "../dist/client");
}

export interface RegisterUiStaticOptions {
  /** Directory containing the built client (Vite `dist/client`). */
  clientRoot?: string;
}

/**
 * Serves the built UI: static assets plus SPA fallback so client-side routes
 * resolve to `index.html` on refresh.
 *
 * This is the single piece of server behaviour the UI needs in production. It is
 * host-agnostic on purpose: the standalone preview server (`server/index.ts`)
 * registers it, and Torii will register it on its own Fastify instance
 * alongside `/api/*` and `/mcp`. There is deliberately no dev/proxy path here —
 * local development runs Vite directly.
 */
export async function registerUiStatic(
  app: FastifyInstance,
  options: RegisterUiStaticOptions = {},
): Promise<void> {
  const clientRoot = options.clientRoot ?? resolveDefaultClientRoot();

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

/** Builds a standalone Fastify server that serves the production UI build. */
export async function createServer(
  options: RegisterUiStaticOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerUiStatic(app, options);
  return app;
}
