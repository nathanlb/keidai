import fastifyHttpProxy from "@fastify/http-proxy";
import fastifyStatic from "@fastify/static";
import {
  OPERATOR_API_ROUTES,
  isOperatorApiSsePath,
  type OperatorApiBackend,
} from "@keidai/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOperatorAuthConfigFromEnv } from "./auth/config.js";
import { registerOperatorAuth } from "./auth/register-auth.js";
import type { OperatorAuthConfig } from "./auth/types.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

function resolveDefaultClientRoot(): string {
  const builtClientRoot = path.resolve(serverDir, "../client");
  if (existsSync(builtClientRoot)) {
    return builtClientRoot;
  }

  return path.resolve(serverDir, "../dist/client");
}

export type OperatorApiBackends = Record<OperatorApiBackend, string>;

export interface RegisterUiStaticOptions {
  /** Directory containing the built client (Vite `dist/client`). */
  clientRoot?: string;
}

export interface CreateServerOptions extends RegisterUiStaticOptions {
  /** Upstream origins for `/api/*` reverse proxy. */
  backends?: Partial<OperatorApiBackends>;
  /**
   * Operator Google OIDC auth. Pass `false` to disable (tests / explicit opt-out).
   * When omitted, config is resolved from environment variables.
   */
  auth?: OperatorAuthConfig | false;
}

const DEFAULT_BACKENDS: OperatorApiBackends = {
  torii: process.env.KEIDAI_UI_TORII_URL ?? "http://127.0.0.1:3100",
  fuda: process.env.KEIDAI_UI_FUDA_URL ?? "http://127.0.0.1:3300",
  shaiden: process.env.KEIDAI_UI_SHAIDEN_URL ?? "http://127.0.0.1:3200",
};

function resolveBackends(
  overrides: Partial<OperatorApiBackends> = {},
): OperatorApiBackends {
  return {
    torii: overrides.torii ?? DEFAULT_BACKENDS.torii,
    fuda: overrides.fuda ?? DEFAULT_BACKENDS.fuda,
    shaiden: overrides.shaiden ?? DEFAULT_BACKENDS.shaiden,
  };
}

function hardenSseHeaders(
  headers: IncomingHttpHeaders,
): IncomingHttpHeaders {
  const next: IncomingHttpHeaders = { ...headers };
  next["cache-control"] = "no-cache, no-transform";
  next["x-accel-buffering"] = "no";
  delete next["content-length"];
  delete next["content-encoding"];
  return next;
}

/**
 * Reverse-proxies `/api/*` using the shared operator route table
 * (`OPERATOR_API_ROUTES` in `@keidai/shared`).
 */
export async function registerApiProxy(
  app: FastifyInstance,
  backends: OperatorApiBackends,
): Promise<void> {
  for (const route of OPERATOR_API_ROUTES) {
    const rewritePrefix = route.pathRewrite
      ? `${route.pathRewrite.to}${route.prefix.slice(route.pathRewrite.from.length)}`
      : route.prefix;

    await app.register(fastifyHttpProxy, {
      upstream: backends[route.backend],
      prefix: route.prefix,
      rewritePrefix,
      // Disable default proxy timeouts so long-lived SSE streams (runs, traces,
      // connections) are not cut off after 10s.
      http: {
        requestOptions: {
          timeout: 0,
        },
      },
      undici: {
        headersTimeout: 0,
        bodyTimeout: 0,
      },
      replyOptions: {
        rewriteHeaders(headers, request) {
          if (request && isOperatorApiSsePath(request.url)) {
            return hardenSseHeaders(headers);
          }
          return headers;
        },
      },
    });
  }
}

/**
 * Serves the built UI: static assets plus SPA fallback so client-side routes
 * resolve to `index.html` on refresh.
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

/**
 * Builds the keidai-ui BFF: operator auth, reverse-proxies `/api/*` to
 * Torii/Fuda/Shaiden, then serves the production SPA.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const backends = resolveBackends(options.backends);

  const authConfig =
    options.auth === false
      ? null
      : (options.auth ?? resolveOperatorAuthConfigFromEnv());

  if (authConfig) {
    await registerOperatorAuth(app, authConfig);
  }

  await registerApiProxy(app, backends);
  await registerUiStatic(app, options);
  return app;
}
