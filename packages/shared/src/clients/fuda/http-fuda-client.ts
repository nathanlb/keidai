import {
  AgentDefinitionError,
  TokenExchangeError,
  type AgentDefinition,
  type AgentDefinitionFailureKind,
  type ExchangeTokenInput,
  type ExchangedAgentToken,
  type FudaClient,
  type TokenExchangeFailureKind,
} from "./types.js";

export interface HttpFudaClientOptions {
  baseUrl: string;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 10s. */
  timeoutMs?: number;
}

interface TokenExchangeSuccessBody {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
}

interface TokenExchangeErrorBody {
  error?: unknown;
}

interface AgentDefinitionBody {
  name?: unknown;
  slug?: unknown;
  persona?: unknown;
  personaVersion?: unknown;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function kindForTokenStatus(
  status: number,
  errorText: string,
): TokenExchangeFailureKind {
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

function messageForTokenKind(
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

function kindForDefinitionStatus(status: number): AgentDefinitionFailureKind {
  if (status === 404) {
    return "agent_not_found";
  }
  return "unexpected";
}

function messageForDefinitionKind(
  kind: AgentDefinitionFailureKind,
  status: number,
  errorText: string,
): string {
  switch (kind) {
    case "agent_not_found":
      return "Fuda agent not found";
    case "unreachable":
      return `Fuda unreachable while fetching agent definition: ${errorText}`;
    default:
      return `Fuda agent definition fetch failed (${status}): ${errorText || "unknown error"}`;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

async function readErrorText(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return "";
  }
  try {
    const body = JSON.parse(raw) as TokenExchangeErrorBody;
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // not JSON — return raw text
  }
  return raw;
}

/**
 * HTTP client for Fuda's agent-facing surface: token exchange and definition
 * fetch (NAT-126 / NAT-127).
 */
export function createHttpFudaClient(options: HttpFudaClientOptions): FudaClient {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchFn(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (isAbortError(error)) {
        throw new TypeError(`Fuda request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async exchangeToken(input: ExchangeTokenInput): Promise<ExchangedAgentToken> {
      let response: Response;
      try {
        response = await fetchWithTimeout(`${baseUrl}/token`, {
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
        const errorText = await readErrorText(response);
        const kind = kindForTokenStatus(response.status, errorText);
        throw new TokenExchangeError(
          kind,
          messageForTokenKind(kind, response.status, errorText),
          { status: response.status },
        );
      }

      let body: TokenExchangeSuccessBody;
      try {
        body = (await response.json()) as TokenExchangeSuccessBody;
      } catch (error) {
        throw new TokenExchangeError(
          "unexpected",
          "Fuda token exchange returned an invalid response body",
          { status: response.status, cause: error },
        );
      }
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

    async getAgentDefinition(agentId: string): Promise<AgentDefinition> {
      const encodedId = encodeURIComponent(agentId);
      let response: Response;
      try {
        response = await fetchWithTimeout(`${baseUrl}/agents/${encodedId}`, {
          method: "GET",
          headers: { accept: "application/json" },
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new AgentDefinitionError(
          "unreachable",
          messageForDefinitionKind("unreachable", 0, detail),
          { cause: error },
        );
      }

      if (!response.ok) {
        const errorText = await readErrorText(response);
        const kind = kindForDefinitionStatus(response.status);
        throw new AgentDefinitionError(
          kind,
          messageForDefinitionKind(kind, response.status, errorText),
          { status: response.status },
        );
      }

      let body: AgentDefinitionBody;
      try {
        body = (await response.json()) as AgentDefinitionBody;
      } catch (error) {
        throw new AgentDefinitionError(
          "unexpected",
          "Fuda agent definition returned an invalid response body",
          { status: response.status, cause: error },
        );
      }
      if (
        typeof body.name !== "string" ||
        body.name.length === 0 ||
        typeof body.slug !== "string" ||
        body.slug.length === 0 ||
        typeof body.persona !== "string" ||
        body.persona.length === 0 ||
        typeof body.personaVersion !== "number" ||
        !Number.isInteger(body.personaVersion) ||
        body.personaVersion < 1
      ) {
        throw new AgentDefinitionError(
          "unexpected",
          "Fuda agent definition returned an invalid response body",
          { status: response.status },
        );
      }

      return {
        name: body.name,
        slug: body.slug,
        persona: body.persona,
        personaVersion: body.personaVersion,
      };
    },
  };
}
