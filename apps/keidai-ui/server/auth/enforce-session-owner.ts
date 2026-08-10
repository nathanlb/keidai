import type { FastifyReply, FastifyRequest } from "fastify";
import type { OperatorPrincipal } from "./types.js";

function requestSessionOwnerId(request: FastifyRequest): string | undefined {
  const principal: OperatorPrincipal | undefined = request.operatorPrincipal;
  return principal?.ownerId;
}

/**
 * Agent create is `POST /api/agents` exactly (not nested agent routes).
 * `request.url` may be full (`/api/agents`) or prefix-stripped (`/`).
 */
function isAgentCreatePath(url: string): boolean {
  const pathname = url.split("?")[0] ?? url;
  return (
    pathname === "/" ||
    pathname === "" ||
    pathname === "/api/agents"
  );
}

/**
 * Path for OAuth initiate — may be full `/api/...` (raw) or prefix-stripped.
 */
function isOAuthInitiatePath(url: string): boolean {
  const pathname = url.split("?")[0] ?? url;
  return (
    pathname.startsWith("/oauth/initiate/") ||
    pathname.startsWith("/api/oauth/initiate/")
  );
}

/**
 * Forces `ownerId` on agent create to the session principal.
 * Client-supplied values are stripped (overwritten).
 */
export function forceSessionOwnerOnAgentCreateBody(
  body: unknown,
  ownerId: string,
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ownerId };
  }

  return {
    ...(body as Record<string, unknown>),
    ownerId,
  };
}

/**
 * Forces `?owner=` on OAuth initiate to the session principal.
 * Returns the rewritten path+query (no origin).
 */
export function forceSessionOwnerOnOAuthInitiateUrl(
  url: string,
  ownerId: string,
): string {
  const parsed = new URL(url, "http://keidai.local");
  parsed.searchParams.set("owner", ownerId);
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * `@fastify/http-proxy` preHandler for the Fuda `/api/agents` mount.
 * Requires `proxyPayloads: false` so JSON bodies are parsed and re-sent.
 */
export async function enforceSessionOwnerOnAgentProxy(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.method !== "POST" || !isAgentCreatePath(request.url)) {
    return;
  }

  const ownerId = requestSessionOwnerId(request);
  if (!ownerId) {
    return;
  }

  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    return reply.code(400).send({ error: "Invalid JSON body" });
  }

  request.body = forceSessionOwnerOnAgentCreateBody(request.body, ownerId);
}

/**
 * `@fastify/http-proxy` preHandler for the Torii `/api` mount.
 * Rewrites OAuth initiate `?owner=` to the session principal before proxying.
 *
 * Mutates `request.raw.url` (Fastify's `request.url` is a read-only getter over
 * it) so `@fastify/http-proxy` forwards the forced query string.
 */
export async function enforceSessionOwnerOnToriiApiProxy(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (request.method !== "POST" || !isOAuthInitiatePath(request.url)) {
    return;
  }

  const ownerId = requestSessionOwnerId(request);
  if (!ownerId) {
    return;
  }

  request.raw.url = forceSessionOwnerOnOAuthInitiateUrl(request.url, ownerId);
}
