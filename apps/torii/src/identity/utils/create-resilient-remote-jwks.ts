import * as jose from "jose";

export type JwtVerifyKey = jose.JWTVerifyGetKey;

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_CACHE_MAX_AGE_MS = 600_000;
const DEFAULT_MAX_RETRIES = 2;

export interface ResilientRemoteJwksOptions {
  timeoutDuration?: number;
  cooldownDuration?: number;
  cacheMaxAge?: number;
  maxRetries?: number;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Remote JWKS with retry and keep-last-known-good on refresh failure.
 *
 * jose's createRemoteJWKSet drops verification when a refresh fails after the
 * cache expires, even if a prior JWKS is still in memory. This wrapper retries
 * the HTTP fetch and, after a successful first fetch, falls back to the cached
 * set when a later refresh fails — so a Fuda blip does not break the gateway.
 */
export function createResilientRemoteJWKSet(
  url: URL,
  options: ResilientRemoteJwksOptions = {},
): JwtVerifyKey {
  const timeoutDuration = options.timeoutDuration ?? DEFAULT_TIMEOUT_MS;
  const cooldownDuration = options.cooldownDuration ?? DEFAULT_COOLDOWN_MS;
  const cacheMaxAge = options.cacheMaxAge ?? DEFAULT_CACHE_MAX_AGE_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const fetchImpl = options.fetchImpl ?? fetch;

  const remote = jose.createRemoteJWKSet(url, {
    timeoutDuration,
    cooldownDuration,
    cacheMaxAge,
    [jose.customFetch]: async (resource, init) => {
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fetchImpl(resource, init);
        } catch (error) {
          lastError = error;
          if (attempt === maxRetries) {
            break;
          }
        }
      }
      throw lastError;
    },
  });

  return async (protectedHeader, token) => {
    try {
      return await remote(protectedHeader, token);
    } catch (error) {
      const cached = remote.jwks();
      if (!cached) {
        throw error;
      }
      // Refresh failed (or key lookup failed after a failed reload). Prefer
      // last-known-good JWKS over failing the gateway while Fuda is down.
      return jose.createLocalJWKSet(cached)(protectedHeader, token);
    }
  };
}
