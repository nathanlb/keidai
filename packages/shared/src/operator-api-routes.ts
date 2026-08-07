/**
 * Operator UI reverse-proxy table.
 *
 * Single source of truth for the Vite dev proxy and the keidai-ui BFF so
 * routing stays identical in both environments.
 *
 * Order matters: more specific prefixes must appear before catch-alls
 * (`/api`). Non-`/api` routes (Torii OAuth callbacks) are public browser
 * redirects and must not require an operator session.
 */

export type OperatorApiBackend = "torii" | "fuda" | "shaiden";

export interface OperatorApiPathRewrite {
  /** Path prefix to strip from the inbound request. */
  from: string;
  /** Replacement prefix forwarded to the backend. */
  to: string;
}

export interface OperatorApiRoute {
  /** Inbound path prefix (matched as a Vite/Fastify proxy mount). */
  prefix: string;
  backend: OperatorApiBackend;
  /** Optional path rewrite (e.g. `/api/fuda/health` → `/api/health`). */
  pathRewrite?: OperatorApiPathRewrite;
  /**
   * When true, SSE hardening applies to requests under this prefix whose path
   * contains `/events` (e.g. `/api/runs/events`, `/api/traces/events`).
   */
  sse?: boolean;
}

export const OPERATOR_API_ROUTES: readonly OperatorApiRoute[] = [
  // Torii backend OAuth provider redirects (not under /api; no session gate).
  { prefix: "/oauth/callback", backend: "torii" },
  {
    prefix: "/api/shaiden/health",
    backend: "shaiden",
    pathRewrite: { from: "/api/shaiden", to: "/api" },
  },
  { prefix: "/api/tasks", backend: "shaiden" },
  { prefix: "/api/runs", backend: "shaiden", sse: true },
  {
    prefix: "/api/fuda/health",
    backend: "fuda",
    pathRewrite: { from: "/api/fuda", to: "/api" },
  },
  { prefix: "/api/agents", backend: "fuda" },
  { prefix: "/api/bearers", backend: "fuda" },
  { prefix: "/api/traces", backend: "torii", sse: true },
  { prefix: "/api", backend: "torii" },
];

/** Rewrite an inbound path for the matched route, if configured. */
export function rewriteOperatorApiPath(
  path: string,
  route: OperatorApiRoute,
): string {
  if (!route.pathRewrite) {
    return path;
  }

  const { from, to } = route.pathRewrite;
  if (!path.startsWith(from)) {
    return path;
  }

  return `${to}${path.slice(from.length)}`;
}

/** True when the request should be treated as an SSE stream for proxy hardening. */
export function isOperatorApiSsePath(path: string): boolean {
  const pathname = path.split("?")[0] ?? path;
  return pathname.includes("/events");
}

/** True when this route may carry SSE and the request path is an events stream. */
export function shouldHardenOperatorApiSse(
  path: string,
  route: OperatorApiRoute,
): boolean {
  return Boolean(route.sse) && isOperatorApiSsePath(path);
}
