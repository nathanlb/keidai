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
  return pathname === "/" || pathname === "" || pathname === "/api/agents";
}

/**
 * Internal-only Torii routes that must never be reachable through the browser
 * BFF proxy (invoked service-to-service by Fuda directly against Torii).
 */
export function isInternalOnlyToriiPath(url: string): boolean {
  const pathname = url.split("?")[0] ?? url;
  return (
    pathname === "/oauth/grants" ||
    pathname.startsWith("/oauth/grants/") ||
    pathname === "/api/oauth/grants" ||
    pathname.startsWith("/api/oauth/grants/")
  );
}

/**
 * Checks whether a Torii API request must bind `?owner=` to the session
 * principal. `url` may be full (`/api/...`) or prefix-stripped (`/...`).
 */
export function isSessionOwnerQueryRequest(
  method: string,
  url: string,
): boolean {
  const pathname = url.split("?")[0] ?? url;
  const upperMethod = method.toUpperCase();

  if (upperMethod === "POST") {
    return (
      pathname.startsWith("/oauth/initiate/") ||
      pathname.startsWith("/api/oauth/initiate/") ||
      pathname === "/connections/reconnect" ||
      pathname === "/api/connections/reconnect" ||
      /(?:^|\/)connections\/[^/]+\/reconnect$/.test(pathname)
    );
  }

  if (upperMethod === "GET") {
    return (
      pathname === "/oauth/connections" ||
      pathname === "/api/oauth/connections" ||
      pathname === "/connections" ||
      pathname === "/api/connections" ||
      pathname === "/connections/events" ||
      pathname === "/api/connections/events"
    );
  }

  if (upperMethod === "DELETE") {
    return /(?:^|\/)oauth\/connections\/[^/]+$/.test(pathname);
  }

  return false;
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
 * Forces `?owner=` to the session principal.
 * Returns the rewritten path+query (no origin).
 */
export function forceSessionOwnerQuery(url: string, ownerId: string): string {
  const parsed = new URL(url, "http://keidai.local");
  parsed.searchParams.set("owner", ownerId);
  return `${parsed.pathname}${parsed.search}`;
}

/** @deprecated Use forceSessionOwnerQuery */
export const forceSessionOwnerOnOAuthInitiateUrl = forceSessionOwnerQuery;

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

  if (
    !request.body ||
    typeof request.body !== "object" ||
    Array.isArray(request.body)
  ) {
    return reply.code(400).send({ error: "Invalid JSON body" });
  }

  request.body = forceSessionOwnerOnAgentCreateBody(request.body, ownerId);
}

/**
 * `@fastify/http-proxy` preHandler for the Torii `/api` mount.
 * Blocks internal-only grant wipe routes and rewrites OAuth / connection
 * `?owner=` queries to the session principal before proxying.
 *
 * Mutates `request.raw.url` (Fastify's `request.url` is a read-only getter over
 * it) so `@fastify/http-proxy` forwards the forced query string.
 */
export async function enforceSessionOwnerOnToriiApiProxy(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isInternalOnlyToriiPath(request.url)) {
    return reply.code(403).send({ error: "Forbidden" });
  }

  if (!isSessionOwnerQueryRequest(request.method, request.url)) {
    return;
  }

  const ownerId = requestSessionOwnerId(request);
  if (!ownerId) {
    return;
  }

  request.raw.url = forceSessionOwnerQuery(request.url, ownerId);
}
