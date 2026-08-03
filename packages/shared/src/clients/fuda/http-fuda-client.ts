import {
  TokenExchangeError,
  type ExchangeTokenInput,
  type ExchangedAgentToken,
  type FudaClient,
  type TokenExchangeFailureKind,
} from "./types.js";

export interface HttpFudaClientOptions {
  baseUrl: string;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

interface TokenExchangeSuccessBody {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
}

interface TokenExchangeErrorBody {
  error?: unknown;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function kindForStatus(status: number, errorText: string): TokenExchangeFailureKind {
  if (status === 401) {
    return "invalid_subject";
  }
  if (status === 403) {
    return "grant_denied";
  }
  if (status === 404) {
    return "agent_not_found";
  }
  if (status === 400) {
    return "invalid_request";
  }
  if (errorText.includes("bearer not granted")) {
    return "grant_denied";
  }
  return "unexpected";
}

function messageForKind(
  kind: TokenExchangeFailureKind,
  status: number,
  errorText: string,
): string {
  switch (kind) {
    case "invalid_subject":
      return "Fuda rejected subject token";
    case "grant_denied":
      return "Fuda denied agent grant (bearer not granted for agent)";
    case "agent_not_found":
      return "Fuda agent not found";
    case "invalid_request":
      return `Fuda rejected token exchange request: ${errorText || status}`;
    default:
      return `Fuda token exchange failed (${status}): ${errorText || "unknown error"}`;
  }
}

/**
 * HTTP client for Fuda's agent-facing surface. v0 covers token exchange only;
 * definition fetch (NAT-127) can share this module later.
 */
export function createHttpFudaClient(options: HttpFudaClientOptions): FudaClient {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const fetchFn = options.fetch ?? fetch;

  return {
    async exchangeToken(input: ExchangeTokenInput): Promise<ExchangedAgentToken> {
      let response: Response;
      try {
        response = await fetchFn(`${baseUrl}/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subject_token: input.subjectToken,
            agent_id: input.agentId,
          }),
        });
      } catch (error) {
        throw new TokenExchangeError(
          "unreachable",
          `Fuda unreachable during token exchange: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }

      if (!response.ok) {
        let errorText = "";
        try {
          const body = (await response.json()) as TokenExchangeErrorBody;
          if (typeof body.error === "string") {
            errorText = body.error;
          }
        } catch {
          errorText = await response.text().catch(() => "");
        }
        const kind = kindForStatus(response.status, errorText);
        throw new TokenExchangeError(
          kind,
          messageForKind(kind, response.status, errorText),
          { status: response.status },
        );
      }

      const body = (await response.json()) as TokenExchangeSuccessBody;
      if (
        typeof body.access_token !== "string" ||
        body.access_token.length === 0 ||
        typeof body.expires_in !== "number" ||
        !Number.isFinite(body.expires_in) ||
        body.expires_in <= 0
      ) {
        throw new TokenExchangeError(
          "unexpected",
          "Fuda token exchange returned an invalid response body",
          { status: response.status },
        );
      }

      return {
        accessToken: body.access_token,
        tokenType: "Bearer",
        expiresIn: body.expires_in,
      };
    },
  };
}
