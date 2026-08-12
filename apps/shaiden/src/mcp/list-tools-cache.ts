import { MAX_CACHE_TTL_MS } from "@modelcontextprotocol/client";

/** Wire-only cache hint on cacheable MCP results (SEP-2549); stripped from public SDK types. */
export type ListToolsCacheHint = {
  ttlMs: number;
  cacheScope?: "public" | "private";
};

/**
 * Read `ttlMs` / `cacheScope` from a `tools/list` result when the server emits them
 * (required on 2026-07-28; absent on legacy Torii).
 */
export function readListToolsCacheHint(result: unknown): ListToolsCacheHint | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const ttlMs = (result as { ttlMs?: unknown }).ttlMs;
  if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs < 0) {
    return undefined;
  }
  const cacheScope = (result as { cacheScope?: unknown }).cacheScope;
  return {
    ttlMs,
    ...(cacheScope === "public" || cacheScope === "private"
      ? { cacheScope }
      : {}),
  };
}

/** Absolute expiry time for a list result, capped by the SDK's max TTL. */
export function listToolsExpiresAtMs(
  hint: ListToolsCacheHint | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (!hint) {
    return undefined;
  }
  const ttlMs = Math.min(hint.ttlMs, MAX_CACHE_TTL_MS);
  return nowMs + ttlMs;
}

export function listToolsCacheIsStale(
  expiresAtMs: number | undefined,
  nowMs: number = Date.now(),
): boolean {
  return expiresAtMs !== undefined && nowMs >= expiresAtMs;
}
