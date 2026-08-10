import { timingSafeEqual } from "node:crypto";

/**
 * BFF → backend management API service token (NAT-138).
 * Server-only: import via `@keidai/shared/bff-service-token`, not the main barrel
 * (uses `node:crypto`; must not enter the Vite client graph).
 *
 * Required by default. Opt out only with `BFF_SERVICE_TOKEN_DISABLED=true`
 * (or pass `bffServiceToken: null` into the keidai-ui BFF).
 */

/** Shared env var for BFF → backend management API auth. */
export const BFF_SERVICE_TOKEN_ENV = "BFF_SERVICE_TOKEN";

/** Explicit opt-out; when true/1/yes the management API gate is off. */
export const BFF_SERVICE_TOKEN_DISABLED_ENV = "BFF_SERVICE_TOKEN_DISABLED";

export type BffServiceTokenDecision =
  | { ok: true }
  | { ok: false; statusCode: 401; error: string };

export function isBffServiceTokenDisabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[BFF_SERVICE_TOKEN_DISABLED_ENV]?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * Resolve the shared BFF service token from env.
 * - `BFF_SERVICE_TOKEN_DISABLED=true` → `null` (gate off)
 * - otherwise `BFF_SERVICE_TOKEN` is required (throws if missing/blank)
 */
export function resolveBffServiceToken(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  if (isBffServiceTokenDisabled(env)) {
    return null;
  }

  const value = env[BFF_SERVICE_TOKEN_ENV]?.trim();
  if (!value) {
    throw new Error(
      "BFF_SERVICE_TOKEN is required for management API hardening. " +
        "Generate with `openssl rand -hex 32`, or set " +
        "BFF_SERVICE_TOKEN_DISABLED=true to opt out (local tests only).",
    );
  }

  return value;
}

/** Build the Authorization header value the BFF sends upstream. */
export function bffServiceTokenAuthorizationHeader(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Management `/api/*` paths that require the service token when the gate is on.
 * Health probes stay open so compose/k8s checks need no header.
 */
export function isBffServiceTokenProtectedPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === "/api/health") {
    return false;
  }
  return path === "/api" || path.startsWith("/api/");
}

export function extractBearerCredential(
  authorization: string | string[] | undefined,
): string | null {
  const header = Array.isArray(authorization)
    ? authorization[0]
    : authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const credential = header.slice("Bearer ".length).trim();
  return credential || null;
}

function timingSafeEqualString(presented: string, expected: string): boolean {
  const presentedBuf = Buffer.from(presented);
  const expectedBuf = Buffer.from(expected);
  if (presentedBuf.length !== expectedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(presentedBuf, expectedBuf);
}

/**
 * Authorize a management API request against the configured BFF service token.
 * When `expectedToken` is null, the gate was explicitly disabled.
 */
export function authorizeBffServiceToken(input: {
  expectedToken: string | null;
  authorization: string | string[] | undefined;
  pathname: string;
}): BffServiceTokenDecision {
  if (!input.expectedToken) {
    return { ok: true };
  }
  if (!isBffServiceTokenProtectedPath(input.pathname)) {
    return { ok: true };
  }

  const presented = extractBearerCredential(input.authorization);
  if (
    !presented ||
    !timingSafeEqualString(presented, input.expectedToken)
  ) {
    return { ok: false, statusCode: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
