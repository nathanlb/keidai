import {
  TokenExchangeError,
  type FudaClient,
} from "@keidai/shared/clients";

/** Audience Fuda stamps on sandbox runtime tokens. */
export const SANDBOX_TOKEN_AUDIENCE = "shaiden-sandbox";

const DEFAULT_REFRESH_SKEW_MS = 30_000;

export interface SandboxTokenProvider {
  /** Short-lived Fuda JWT with `aud=shaiden-sandbox`. Remints near expiry. */
  ensureToken(options?: { force?: boolean }): Promise<string>;
}

/**
 * Exchanges Shaiden's subject token for a sandbox-audience JWT. The executed
 * process never receives this token: the subject credential stays in Shaiden,
 * and the audience is not `torii`.
 */
export function createSandboxTokenProvider(input: {
  fuda: FudaClient;
  getSubjectToken: () => string | Promise<string>;
  refreshSkewMs?: number;
  now?: () => number;
}): SandboxTokenProvider {
  const refreshSkewMs = input.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
  const now = input.now ?? Date.now;
  let cached: { accessToken: string; expiresAtMs: number } | undefined;

  return {
    async ensureToken(options = {}) {
      const at = now();
      if (
        !options.force &&
        cached &&
        at < cached.expiresAtMs - refreshSkewMs
      ) {
        return cached.accessToken;
      }

      try {
        const minted = await input.fuda.exchangeToken({
          subjectToken: await input.getSubjectToken(),
          audience: SANDBOX_TOKEN_AUDIENCE,
        });
        cached = {
          accessToken: minted.accessToken,
          expiresAtMs: at + minted.expiresIn * 1000,
        };
        return cached.accessToken;
      } catch (error) {
        if (
          cached &&
          at < cached.expiresAtMs &&
          error instanceof TokenExchangeError &&
          error.kind === "unreachable"
        ) {
          return cached.accessToken;
        }
        throw error;
      }
    },
  };
}
