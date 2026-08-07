import {
  TokenExchangeError,
  type FudaClient,
} from "@keidai/shared/clients";

/** Refresh a bit before wall-clock expiry so mid-call expiry is unlikely. */
const DEFAULT_REFRESH_SKEW_MS = 30_000;

export interface AgentTokenProvider {
  /**
   * Returns a Torii-facing agent JWT. Remints when missing, expired, within
   * skew, or when `force` is set (approval resume). Mid-run Fuda unavailability
   * keeps a still-valid cached token rather than failing the run.
   */
  ensureToken(options?: { force?: boolean }): Promise<string>;
}

export interface CreateAgentTokenProviderInput {
  fuda: FudaClient;
  /**
   * Subject token for each mint/remint. Prefer a function that re-reads a
   * projected SA token file so rotation does not leave a stale string cached.
   */
  getSubjectToken: () => string | Promise<string>;
  agentId: string;
  refreshSkewMs?: number;
  now?: () => number;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * Caches a Fuda-minted agent JWT for one harness run. Mint happens when the
 * loop needs Torii credentials, not once at task start with a long hold.
 */
export function createAgentTokenProvider(
  input: CreateAgentTokenProviderInput,
): AgentTokenProvider {
  const refreshSkewMs = input.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
  const now = input.now ?? Date.now;
  let cached: CachedToken | undefined;

  const isUsable = (token: CachedToken, at: number): boolean =>
    at < token.expiresAtMs;

  const needsRefresh = (token: CachedToken | undefined, at: number): boolean => {
    if (!token) {
      return true;
    }
    return at >= token.expiresAtMs - refreshSkewMs;
  };

  return {
    async ensureToken(options = {}): Promise<string> {
      const at = now();
      const force = options.force === true;

      if (!force && cached && !needsRefresh(cached, at)) {
        return cached.accessToken;
      }

      try {
        const subjectToken = await input.getSubjectToken();
        const minted = await input.fuda.exchangeToken({
          subjectToken,
          agentId: input.agentId,
        });
        cached = {
          accessToken: minted.accessToken,
          expiresAtMs: at + minted.expiresIn * 1000,
        };
        return cached.accessToken;
      } catch (error) {
        // Mid-task Fuda outage must not kill an already-minted run — even on
        // force remint (approval resume) — when the cached JWT is still valid.
        // Grant revocation and other rejections still fail hard.
        if (
          cached &&
          isUsable(cached, at) &&
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
